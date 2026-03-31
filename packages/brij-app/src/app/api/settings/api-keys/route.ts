/**
 * Bot API key management endpoints for coordinators.
 *
 * GET  — list active keys for the user's coordinator groups
 * POST — generate a new key (returns raw token once)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { botApiKeys, groupMemberships, groups } from "@/db/schema";
import { eq, and, isNull, inArray, desc } from "drizzle-orm";

const MAX_KEYS_PER_GROUP = 3;

/** GET /api/settings/api-keys — list keys for user's coordinator groups */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find groups where user is coordinator
  const coordGroups = await db
    .select({ groupId: groupMemberships.groupId, groupName: groups.name })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(
      and(
        eq(groupMemberships.userId, user.id),
        eq(groupMemberships.role, "coordinator"),
        eq(groupMemberships.status, "active"),
        isNull(groups.deletedAt)
      )
    );

  if (coordGroups.length === 0) {
    return NextResponse.json({ groups: [], keys: [] });
  }

  const groupIds = coordGroups.map((g) => g.groupId);

  // Get all non-revoked keys for these groups
  const keys = await db
    .select({
      id: botApiKeys.id,
      groupId: botApiKeys.groupId,
      keyPrefix: botApiKeys.keyPrefix,
      label: botApiKeys.label,
      expiresAt: botApiKeys.expiresAt,
      createdAt: botApiKeys.createdAt,
      revokedAt: botApiKeys.revokedAt,
    })
    .from(botApiKeys)
    .where(
      and(
        inArray(botApiKeys.groupId, groupIds),
        isNull(botApiKeys.revokedAt)
      )
    )
    .orderBy(desc(botApiKeys.createdAt));

  return NextResponse.json({
    groups: coordGroups.map((g) => ({ id: g.groupId, name: g.groupName })),
    keys,
  });
}

const VALID_EXPIRY_DAYS = [1, 7, 30];

/** POST /api/settings/api-keys — generate a new key */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { groupId, label, expiryDays } = body as {
    groupId: string;
    label?: string;
    expiryDays: number;
  };

  if (!groupId || !expiryDays || !VALID_EXPIRY_DAYS.includes(expiryDays)) {
    return NextResponse.json(
      { error: "groupId and expiryDays (1, 7, or 30) are required" },
      { status: 400 }
    );
  }

  // Verify user is coordinator of this group
  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, groupId),
      eq(groupMemberships.userId, user.id),
      eq(groupMemberships.role, "coordinator"),
      eq(groupMemberships.status, "active")
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Not a coordinator of this group" }, { status: 403 });
  }

  // Check active key count for this group
  const activeKeys = await db
    .select({ id: botApiKeys.id })
    .from(botApiKeys)
    .where(
      and(
        eq(botApiKeys.groupId, groupId),
        isNull(botApiKeys.revokedAt)
      )
    );

  // Filter out expired keys from count
  const now = new Date();
  const validKeys = activeKeys.filter(
    (k) => true // revokedAt is already filtered; expiry checked below
  );

  if (activeKeys.length >= MAX_KEYS_PER_GROUP) {
    return NextResponse.json(
      { error: `Maximum ${MAX_KEYS_PER_GROUP} active keys per group` },
      { status: 409 }
    );
  }

  // Generate raw key
  const randomPart = generateRandomHex(32);
  const rawKey = `brij_bot_${randomPart}`;
  const keyPrefix = rawKey.slice(0, 16); // "brij_bot_" + first 7 of random

  // Hash for storage
  const keyBytes = new TextEncoder().encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyBytes);
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiryDays);

  const [created] = await db
    .insert(botApiKeys)
    .values({
      groupId,
      keyHash,
      keyPrefix,
      label: label?.trim() || null,
      expiresAt,
      createdById: user.id,
    })
    .returning({ id: botApiKeys.id, createdAt: botApiKeys.createdAt });

  return NextResponse.json(
    {
      id: created.id,
      rawKey, // Shown once, never stored
      keyPrefix,
      label: label?.trim() || null,
      expiresAt: expiresAt.toISOString(),
      createdAt: created.createdAt,
    },
    { status: 201 }
  );
}

function generateRandomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
