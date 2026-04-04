import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { platformIdentities, groups } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/link/accounts
 *
 * Returns the authenticated user's linked platform accounts.
 * Grouped by (platform, platformUserId) with group names.
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const linked = await db
    .select({
      platform: platformIdentities.platform,
      platformUserId: platformIdentities.platformUserId,
      platformUsername: platformIdentities.platformUsername,
      linkedAt: platformIdentities.linkedAt,
      groupName: groups.name,
    })
    .from(platformIdentities)
    .innerJoin(groups, eq(groups.id, platformIdentities.groupId))
    .where(eq(platformIdentities.userId, user.id));

  // Group by (platform, platformUserId)
  const accountMap = new Map<string, {
    platform: string;
    platformUserId: string;
    platformUsername: string | null;
    linkedAt: Date | null;
    groups: string[];
  }>();

  for (const row of linked) {
    const key = `${row.platform}:${row.platformUserId}`;
    const existing = accountMap.get(key);
    if (existing) {
      existing.groups.push(row.groupName);
      // Use most recent username
      if (row.platformUsername) existing.platformUsername = row.platformUsername;
    } else {
      accountMap.set(key, {
        platform: row.platform,
        platformUserId: row.platformUserId,
        platformUsername: row.platformUsername,
        linkedAt: row.linkedAt,
        groups: [row.groupName],
      });
    }
  }

  return NextResponse.json({
    accounts: Array.from(accountMap.values()),
  });
}
