/**
 * Bot API authentication middleware.
 *
 * Validates brij_bot_ API keys, checks expiry/revocation,
 * resolves the associated group, and returns a typed context.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { botApiKeys, groups, groupMemberships } from "@/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";
import { checkRateLimit } from "@/lib/rate-limit";

export interface BotContext {
  keyId: string;
  groupId: string;
  group: {
    id: string;
    name: string;
    memberCount: number;
    coverImageUrl: string | null;
    platform: string | null;
    platformGuildId: string | null;
  };
  createdById: string; // The coordinator who created the key
}

/**
 * Authenticate a bot API request. Returns BotContext on success,
 * or a NextResponse error (401/429) on failure.
 *
 * Usage in route handler:
 *   const auth = await authenticateBot(req);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth is BotContext
 */
export async function authenticateBot(
  req: NextRequest,
  tier: "read" | "write" = "read"
): Promise<BotContext | NextResponse> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer brij_bot_")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawKey = authHeader.slice(7); // Remove "Bearer "

  // Hash the key with Web Crypto API (available in Edge/Node 18+)
  const keyBytes = new TextEncoder().encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyBytes);
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Look up key by hash
  const [key] = await db
    .select()
    .from(botApiKeys)
    .where(
      and(
        eq(botApiKeys.keyHash, keyHash),
        isNull(botApiKeys.revokedAt)
      )
    )
    .limit(1);

  if (!key) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check expiry
  if (new Date() > key.expiresAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit by key ID
  const rateTier = tier === "write" ? "write" : "auth";
  const limited = await checkRateLimit(req, rateTier, `bot:${key.id}`);
  if (limited) return limited;

  // Resolve group with member count
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, key.groupId),
  });

  if (!group || group.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.groupId, group.id),
        eq(groupMemberships.status, "active")
      )
    );

  return {
    keyId: key.id,
    groupId: key.groupId,
    group: {
      id: group.id,
      name: group.name,
      memberCount: countRow?.count ?? 0,
      coverImageUrl: group.coverImageUrl ?? null,
      platform: group.platform ?? null,
      platformGuildId: group.platformGuildId ?? null,
    },
    createdById: key.createdById,
  };
}
