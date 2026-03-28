import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, groups, groupMemberships, activities, attendances } from "@/db/schema";
import { eq, and, count, isNull } from "drizzle-orm";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/profile/[userId] — public profile data
 *
 * Returns aggregate stats for a user's public profile.
 * No auth required (visitor teaser). Authenticated callers
 * will get more data in future (co-member view).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const limited = await checkRateLimit(req, "public");
  if (limited) return limited;

  const { userId } = await params;

  // Fetch user (basic info only — no email)
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Fetch active group memberships with group details
  const memberships = await db
    .select({
      groupId: groupMemberships.groupId,
      role: groupMemberships.role,
      joinedAt: groupMemberships.joinedAt,
      groupName: groups.name,
      groupType: groups.type,
      groupColor: groups.color,
      memberCount: count(groupMemberships.id),
    })
    .from(groupMemberships)
    .innerJoin(groups, and(
      eq(groups.id, groupMemberships.groupId),
      isNull(groups.deletedAt),
    ))
    .where(
      and(
        eq(groupMemberships.userId, userId),
        eq(groupMemberships.status, "active"),
      )
    )
    .groupBy(
      groupMemberships.groupId,
      groupMemberships.role,
      groupMemberships.joinedAt,
      groups.name,
      groups.type,
      groups.color,
      groupMemberships.id,
    );

  // Get member counts per group separately
  const groupIds = memberships.map((m) => m.groupId);
  const memberCounts = new Map<string, number>();
  for (const gid of groupIds) {
    const [result] = await db
      .select({ count: count() })
      .from(groupMemberships)
      .where(and(
        eq(groupMemberships.groupId, gid),
        eq(groupMemberships.status, "active"),
      ));
    memberCounts.set(gid, result?.count || 0);
  }

  // Count activities coordinated
  const [coordinated] = await db
    .select({ count: count() })
    .from(activities)
    .where(eq(activities.coordinatorId, userId));

  // Count activities attended (checked in)
  const [attended] = await db
    .select({ count: count() })
    .from(attendances)
    .where(and(
      eq(attendances.userId, userId),
      eq(attendances.status, "checked_in"),
    ));

  // Calculate months active
  const monthsActive = Math.max(1, Math.floor(
    (Date.now() - new Date(user.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000)
  ));

  // Determine primary community (highest role, then earliest join)
  const roleWeight = { coordinator: 3, member: 1 };
  const sorted = [...memberships].sort((a, b) => {
    const wa = roleWeight[a.role as keyof typeof roleWeight] || 0;
    const wb = roleWeight[b.role as keyof typeof roleWeight] || 0;
    if (wb !== wa) return wb - wa;
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });
  const primary = sorted[0] || null;

  return NextResponse.json({
    id: user.id,
    name: user.name || "Anonymous",
    image: user.image,
    since: user.createdAt,
    monthsActive,
    communities: memberships.map((m) => ({
      id: m.groupId,
      name: m.groupName,
      type: m.groupType,
      color: m.groupColor,
      role: m.role,
      joinedAt: m.joinedAt,
      memberCount: memberCounts.get(m.groupId) || 0,
    })),
    primaryCommunity: primary ? {
      name: primary.groupName,
      role: primary.role,
    } : null,
    highlights: {
      activitiesOrganized: coordinated?.count || 0,
      eventsAttended: attended?.count || 0,
      communities: memberships.length,
      monthsActive,
    },
  });
}
