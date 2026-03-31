import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  users,
  groups,
  groupMemberships,
  activities,
  attendances,
  contributions,
  journalEntries,
} from "@/db/schema";
import { eq, and, count, isNull, desc, inArray } from "drizzle-orm";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAuthUser } from "@/lib/auth";

/**
 * GET /api/profile/[userId] — three-tier public profile
 *
 * Tier 1 (co-member): full detail for shared communities
 * Tier 2 (authenticated, no shared): community cards + role, quotes, contribution breakdown
 * Tier 3 (visitor): community names only, aggregate stats, one quote, CTA
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

  // Check if viewer is authenticated
  const viewer = await getAuthUser();
  const isSelf = viewer?.id === userId;

  // Fetch profile user's active group memberships
  const memberships = await db
    .select({
      groupId: groupMemberships.groupId,
      role: groupMemberships.role,
      joinedAt: groupMemberships.joinedAt,
      groupName: groups.name,
      groupType: groups.type,
      groupColor: groups.color,
    })
    .from(groupMemberships)
    .innerJoin(
      groups,
      and(eq(groups.id, groupMemberships.groupId), isNull(groups.deletedAt))
    )
    .where(
      and(
        eq(groupMemberships.userId, userId),
        eq(groupMemberships.status, "active")
      )
    );

  // Find shared communities if viewer is authenticated
  let viewerGroupIds: string[] = [];
  let sharedGroupIds: string[] = [];
  if (viewer && !isSelf) {
    const viewerMemberships = await db
      .select({ groupId: groupMemberships.groupId })
      .from(groupMemberships)
      .where(
        and(
          eq(groupMemberships.userId, viewer.id),
          eq(groupMemberships.status, "active")
        )
      );
    viewerGroupIds = viewerMemberships.map((m) => m.groupId);
    const profileGroupIds = memberships.map((m) => m.groupId);
    sharedGroupIds = profileGroupIds.filter((id) =>
      viewerGroupIds.includes(id)
    );
  }

  // Determine view tier
  const viewTier: "self" | "member" | "authenticated" | "visitor" = isSelf
    ? "self"
    : viewer && sharedGroupIds.length > 0
      ? "member"
      : viewer
        ? "authenticated"
        : "visitor";

  // Count activities coordinated
  const [coordinated] = await db
    .select({ count: count() })
    .from(activities)
    .where(eq(activities.coordinatorId, userId));

  // Count activities attended (checked in)
  const [attended] = await db
    .select({ count: count() })
    .from(attendances)
    .where(
      and(eq(attendances.userId, userId), eq(attendances.status, "checked_in"))
    );

  // Calculate months active
  const monthsActive = Math.max(
    1,
    Math.floor(
      (Date.now() - new Date(user.createdAt).getTime()) /
        (30 * 24 * 60 * 60 * 1000)
    )
  );

  // Determine primary community (highest role, then most organized activities, then earliest join)
  const roleWeight = { coordinator: 3, member: 1 };
  // Count activities organized per group for primary selection
  const orgCountByGroup = new Map<string, number>();
  if (memberships.length > 0) {
    for (const m of memberships) {
      const [result] = await db
        .select({ count: count() })
        .from(activities)
        .where(
          and(
            eq(activities.coordinatorId, userId),
            eq(activities.groupId, m.groupId)
          )
        );
      orgCountByGroup.set(m.groupId, result?.count || 0);
    }
  }
  const sorted = [...memberships].sort((a, b) => {
    const wa = roleWeight[a.role as keyof typeof roleWeight] || 0;
    const wb = roleWeight[b.role as keyof typeof roleWeight] || 0;
    if (wb !== wa) return wb - wa;
    const orgA = orgCountByGroup.get(a.groupId) || 0;
    const orgB = orgCountByGroup.get(b.groupId) || 0;
    if (orgB !== orgA) return orgB - orgA;
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });
  const primary = sorted[0] || null;

  // Base highlights (all tiers)
  const highlights = {
    activitiesOrganized: coordinated?.count || 0,
    eventsAttended: attended?.count || 0,
    communities: memberships.length,
    monthsActive,
  };

  // --- Tier 3 (visitor): minimal data ---
  if (viewTier === "visitor") {
    // One featured journal entry (most recent, from any group)
    const featuredQuote = await getFeaturedQuote(userId);

    return NextResponse.json({
      id: user.id,
      name: user.name || "Anonymous",
      image: user.image,
      since: user.createdAt,
      viewTier,
      primaryCommunity: primary
        ? { name: primary.groupName, role: primary.role }
        : null,
      communities: memberships.map((m) => ({
        id: m.groupId,
        name: m.groupName,
        color: m.groupColor,
      })),
      highlights,
      featuredQuote,
    });
  }

  // --- Tiers 1, 2, self: richer data ---

  // Get member counts per group
  const groupIds = memberships.map((m) => m.groupId);
  const memberCounts = new Map<string, number>();
  if (groupIds.length > 0) {
    for (const gid of groupIds) {
      const [result] = await db
        .select({ count: count() })
        .from(groupMemberships)
        .where(
          and(
            eq(groupMemberships.groupId, gid),
            eq(groupMemberships.status, "active")
          )
        );
      memberCounts.set(gid, result?.count || 0);
    }
  }

  // Per-community activity counts (for co-member and self tiers)
  const communityStats = new Map<
    string,
    { organized: number; attended: number }
  >();
  if (viewTier === "member" || viewTier === "self") {
    for (const gid of groupIds) {
      const [org] = await db
        .select({ count: count() })
        .from(activities)
        .where(
          and(eq(activities.coordinatorId, userId), eq(activities.groupId, gid))
        );
      const [att] = await db
        .select({ count: count() })
        .from(attendances)
        .innerJoin(activities, eq(activities.id, attendances.activityId))
        .where(
          and(
            eq(attendances.userId, userId),
            eq(attendances.status, "checked_in"),
            eq(activities.groupId, gid)
          )
        );
      communityStats.set(gid, {
        organized: org?.count || 0,
        attended: att?.count || 0,
      });
    }
  }

  // Contribution type breakdown (authenticated+)
  let contributionBreakdown: { type: string; count: number }[] = [];
  const activityIds = await db
    .select({ id: activities.id })
    .from(activities)
    .where(eq(activities.coordinatorId, userId));
  const attendedActivityIds = await db
    .select({ activityId: attendances.activityId })
    .from(attendances)
    .where(
      and(eq(attendances.userId, userId), eq(attendances.status, "checked_in"))
    );
  const allActivityIds = [
    ...new Set([
      ...activityIds.map((a) => a.id),
      ...attendedActivityIds.map((a) => a.activityId),
    ]),
  ];

  if (allActivityIds.length > 0) {
    const contribs = await db
      .select({
        type: contributions.type,
        count: count(),
      })
      .from(contributions)
      .where(eq(contributions.userId, userId))
      .groupBy(contributions.type);
    contributionBreakdown = contribs.map((c) => ({
      type: c.type,
      count: c.count,
    }));
  }

  // Role breakdown: "organized" = activities where user is coordinatorId
  // This is the source of truth (works for events created before coordinator role feature)
  const organizedCount = coordinated?.count || 0;
  const totalAttended = attended?.count || 0;
  // Participated = attended minus the ones they organized (avoid double-counting)
  const participatedCount = Math.max(0, totalAttended - organizedCount);

  // Journal entries as quotes (authenticated+, limit 5)
  const quotes = await getQuotes(userId, 5);

  // Build community list with tiered detail
  const communitiesData = memberships.map((m) => {
    const isShared = sharedGroupIds.includes(m.groupId);
    const base = {
      id: m.groupId,
      name: m.groupName,
      type: m.groupType,
      color: m.groupColor,
      role: m.role,
      joinedAt: m.joinedAt,
      memberCount: memberCounts.get(m.groupId) || 0,
      isShared,
    };

    // Co-member or self: include activity counts for this community
    if (
      (viewTier === "member" || viewTier === "self") &&
      (isShared || viewTier === "self")
    ) {
      const stats = communityStats.get(m.groupId);
      return {
        ...base,
        organized: stats?.organized || 0,
        attended: stats?.attended || 0,
      };
    }

    return base;
  });

  // Sort: shared communities first, then by role weight, then join date
  communitiesData.sort((a, b) => {
    if (a.isShared !== b.isShared) return a.isShared ? -1 : 1;
    const wa = roleWeight[a.role as keyof typeof roleWeight] || 0;
    const wb = roleWeight[b.role as keyof typeof roleWeight] || 0;
    if (wb !== wa) return wb - wa;
    return new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime();
  });

  return NextResponse.json({
    id: user.id,
    name: user.name || "Anonymous",
    image: user.image,
    since: user.createdAt,
    viewTier,
    sharedCommunityCount: sharedGroupIds.length,
    primaryCommunity: primary
      ? { name: primary.groupName, role: primary.role }
      : null,
    communities: communitiesData,
    highlights,
    roleBreakdown: {
      coordinated: organizedCount,
      participated: participatedCount,
    },
    contributionBreakdown,
    quotes,
  });
}

/** Get a single featured quote for visitor view */
async function getFeaturedQuote(
  userId: string
): Promise<{ text: string; authorName: string; groupName: string } | null> {
  const entries = await db
    .select({
      text: journalEntries.text,
      authorName: users.name,
      groupName: groups.name,
    })
    .from(journalEntries)
    .innerJoin(users, eq(users.id, journalEntries.authorId))
    .innerJoin(groups, eq(groups.id, journalEntries.groupId))
    .where(
      and(
        eq(journalEntries.authorId, userId),
        isNull(journalEntries.deletedAt)
      )
    )
    .orderBy(desc(journalEntries.createdAt))
    .limit(1);

  if (entries.length === 0) return null;
  const e = entries[0];
  return {
    text: e.text,
    authorName: e.authorName || "Anonymous",
    groupName: e.groupName,
  };
}

/** Get journal entries as profile quotes */
async function getQuotes(
  userId: string,
  limit: number
): Promise<{ text: string; authorName: string; groupName: string }[]> {
  const entries = await db
    .select({
      text: journalEntries.text,
      authorName: users.name,
      groupName: groups.name,
    })
    .from(journalEntries)
    .innerJoin(users, eq(users.id, journalEntries.authorId))
    .innerJoin(groups, eq(groups.id, journalEntries.groupId))
    .where(
      and(
        eq(journalEntries.authorId, userId),
        isNull(journalEntries.deletedAt)
      )
    )
    .orderBy(desc(journalEntries.createdAt))
    .limit(limit);

  return entries.map((e) => ({
    text: e.text,
    authorName: e.authorName || "Anonymous",
    groupName: e.groupName,
  }));
}
