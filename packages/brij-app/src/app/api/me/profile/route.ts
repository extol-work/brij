import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import {
  users,
  groups,
  groupMemberships,
  activities,
  attendances,
  journalEntries,
  milestones,
  contributions,
  contributionMembers,
  attestationEdges,
} from "@/db/schema";
import { eq, and, count, isNull, desc, sql } from "drizzle-orm";

/**
 * GET /api/me/profile — member-facing profile data for /me page.
 *
 * Returns:
 * - User info
 * - Aggregate stats across all groups
 * - Per-group scoped data (stats, recent feed, cards, milestones)
 * - Cross-community recent feed
 * - Milestones
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fullUser = await db.query.users.findFirst({
    where: eq(users.id, user.id),
  });
  if (!fullUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Get user's active group memberships
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
        eq(groupMemberships.userId, user.id),
        eq(groupMemberships.status, "active")
      )
    );

  const groupIds = memberships.map((m) => m.groupId);

  // Aggregate stats
  const [coordinated] = await db
    .select({ count: count() })
    .from(activities)
    .where(eq(activities.coordinatorId, user.id));

  const [attended] = await db
    .select({ count: count() })
    .from(attendances)
    .where(
      and(eq(attendances.userId, user.id), eq(attendances.status, "checked_in"))
    );

  // Unique people who showed up to user's organized activities
  const [uniqueAttendees] = await db
    .select({ count: sql<number>`count(distinct ${attendances.userId})` })
    .from(attendances)
    .innerJoin(activities, eq(activities.id, attendances.activityId))
    .where(
      and(
        eq(activities.coordinatorId, user.id),
        eq(attendances.status, "checked_in")
      )
    );

  // Journal entry count
  const [journalCount] = await db
    .select({ count: count() })
    .from(journalEntries)
    .where(
      and(eq(journalEntries.authorId, user.id), isNull(journalEntries.deletedAt))
    );

  // Contribution count (created by user)
  const [contribCount] = await db
    .select({ count: count() })
    .from(contributions)
    .where(eq(contributions.createdBy, user.id));

  // Signatures given (confirmed contributions for others)
  const [signaturesGiven] = await db
    .select({ count: count() })
    .from(contributionMembers)
    .where(
      and(eq(contributionMembers.userId, user.id), eq(contributionMembers.confirmed, true))
    );

  // Signatures received (attestation edges where user is subject)
  const [signaturesReceived] = await db
    .select({ count: count() })
    .from(attestationEdges)
    .where(eq(attestationEdges.subjectId, user.id));

  // Per-group data
  const groupData = await Promise.all(
    memberships.map(async (m) => {
      // Member count
      const [memberCount] = await db
        .select({ count: count() })
        .from(groupMemberships)
        .where(
          and(
            eq(groupMemberships.groupId, m.groupId),
            eq(groupMemberships.status, "active")
          )
        );

      // Activities organized in this group
      const [orgCount] = await db
        .select({ count: count() })
        .from(activities)
        .where(
          and(
            eq(activities.coordinatorId, user.id),
            eq(activities.groupId, m.groupId)
          )
        );

      // Activities attended in this group
      const [attCount] = await db
        .select({ count: count() })
        .from(attendances)
        .innerJoin(activities, eq(activities.id, attendances.activityId))
        .where(
          and(
            eq(attendances.userId, user.id),
            eq(attendances.status, "checked_in"),
            eq(activities.groupId, m.groupId)
          )
        );

      // Weeks since joined
      const weeksSinceJoin = Math.max(
        1,
        Math.floor(
          (Date.now() - new Date(m.joinedAt).getTime()) /
            (7 * 24 * 60 * 60 * 1000)
        )
      );

      // Weeks with activity (attended or organized)
      const [weeksActive] = await db
        .select({
          count: sql<number>`count(distinct date_trunc('week', ${activities.startsAt}))`,
        })
        .from(activities)
        .leftJoin(
          attendances,
          and(
            eq(attendances.activityId, activities.id),
            eq(attendances.userId, user.id),
            eq(attendances.status, "checked_in")
          )
        )
        .where(
          and(
            eq(activities.groupId, m.groupId),
            sql`(${activities.coordinatorId} = ${user.id} OR ${attendances.id} IS NOT NULL)`
          )
        );

      // Recent feed items (activities + journal entries, last 10)
      const recentActivities = await db
        .select({
          id: activities.id,
          title: activities.title,
          startsAt: activities.startsAt,
          status: activities.status,
          cardUrl: activities.cardUrl,
          photoUrl: activities.photoUrl,
          summary: activities.summary,
          attendeeCount: sql<number>`(SELECT count(*) FROM attendances WHERE activity_id = ${activities.id} AND status = 'checked_in')::int`,
          isCoordinator: sql<boolean>`${activities.coordinatorId} = ${user.id}`,
        })
        .from(activities)
        .leftJoin(
          attendances,
          and(
            eq(attendances.activityId, activities.id),
            eq(attendances.userId, user.id),
            eq(attendances.status, "checked_in")
          )
        )
        .where(
          and(
            eq(activities.groupId, m.groupId),
            sql`(${activities.coordinatorId} = ${user.id} OR ${attendances.id} IS NOT NULL)`
          )
        )
        .orderBy(desc(activities.startsAt))
        .limit(5);

      const recentJournals = await db
        .select({
          id: journalEntries.id,
          text: journalEntries.text,
          createdAt: journalEntries.createdAt,
        })
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.groupId, m.groupId),
            eq(journalEntries.authorId, user.id),
            isNull(journalEntries.deletedAt)
          )
        )
        .orderBy(desc(journalEntries.createdAt))
        .limit(5);

      // Extol Cards (closed activities with cardUrl)
      const cards = await db
        .select({
          id: activities.id,
          title: activities.title,
          cardUrl: activities.cardUrl,
          photoUrl: activities.photoUrl,
          startsAt: activities.startsAt,
        })
        .from(activities)
        .leftJoin(
          attendances,
          and(
            eq(attendances.activityId, activities.id),
            eq(attendances.userId, user.id),
            eq(attendances.status, "checked_in")
          )
        )
        .where(
          and(
            eq(activities.groupId, m.groupId),
            eq(activities.status, "closed"),
            sql`${activities.cardUrl} IS NOT NULL`,
            sql`(${activities.coordinatorId} = ${user.id} OR ${attendances.id} IS NOT NULL)`
          )
        )
        .orderBy(desc(activities.startsAt))
        .limit(10);

      // Group milestones
      const groupMilestones = await db.query.milestones.findMany({
        where: eq(milestones.groupId, m.groupId),
      });

      // Build feed (interleave activities + journals by date)
      type FeedItem =
        | { type: "activity"; date: string; title: string; detail: string; activityId: string; cardUrl: string | null }
        | { type: "journal"; date: string; text: string };

      const feed: FeedItem[] = [];
      for (const a of recentActivities) {
        const role = a.isCoordinator ? "Organized" : "Attended";
        feed.push({
          type: "activity",
          date: a.startsAt?.toISOString() || new Date().toISOString(),
          title: `${role}: ${a.title}`,
          detail: a.attendeeCount >= 1 ? `${a.attendeeCount} showed up` : "",
          activityId: a.id,
          cardUrl: a.cardUrl,
        });
      }
      for (const j of recentJournals) {
        feed.push({
          type: "journal",
          date: j.createdAt.toISOString(),
          text: j.text,
        });
      }
      feed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return {
        groupId: m.groupId,
        name: m.groupName,
        type: m.groupType,
        color: m.groupColor,
        role: m.role,
        joinedAt: m.joinedAt,
        memberCount: memberCount?.count || 0,
        stats: {
          organized: orgCount?.count || 0,
          attended: attCount?.count || 0,
          weeksSinceJoin,
          weeksActive: Number(weeksActive?.count) || 0,
        },
        feed: feed.slice(0, 8),
        cards: cards.map((c) => ({
          id: c.id,
          title: c.title,
          cardUrl: c.cardUrl,
          photoUrl: c.photoUrl,
          date: c.startsAt?.toISOString() || null,
        })),
        milestones: groupMilestones.map((ms) => ({
          type: ms.type,
          earnedAt: ms.earnedAt.toISOString(),
        })),
      };
    })
  );

  // Personal contributions (groupId is null)
  const personalContribs = await db
    .select({
      id: contributions.id,
      description: contributions.description,
      contributionType: contributions.contributionType,
      evidenceUrl: contributions.evidenceUrl,
      createdAt: contributions.createdAt,
    })
    .from(contributions)
    .where(
      and(eq(contributions.createdBy, user.id), isNull(contributions.groupId))
    )
    .orderBy(desc(contributions.createdAt))
    .limit(10);

  // Cross-community feed (last 10 items across all groups)
  type CrossFeedItem = {
    type: "activity" | "journal" | "contribution";
    date: string;
    groupId: string | null;
    groupName: string;
    groupColor: string;
    title: string;
    detail?: string;
    activityId?: string;
    text?: string;
    contributionType?: string;
    evidenceUrl?: string | null;
  };

  const crossFeed: CrossFeedItem[] = [];
  for (const g of groupData) {
    for (const item of g.feed) {
      if (item.type === "activity") {
        crossFeed.push({
          type: "activity",
          date: item.date,
          groupId: g.groupId,
          groupName: g.name,
          groupColor: g.color,
          title: item.title,
          detail: item.detail,
          activityId: item.activityId,
        });
      } else {
        crossFeed.push({
          type: "journal",
          date: item.date,
          groupId: g.groupId,
          groupName: g.name,
          groupColor: g.color,
          title: "Journal",
          text: item.text,
        });
      }
    }
  }

  // Add personal contributions to cross-feed
  for (const c of personalContribs) {
    crossFeed.push({
      type: "contribution",
      date: c.createdAt.toISOString(),
      groupId: null,
      groupName: "Personal",
      groupColor: "#8B5CF6", // violet to match smiley
      title: c.description,
      contributionType: c.contributionType,
      evidenceUrl: c.evidenceUrl,
    });
  }

  crossFeed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({
    id: fullUser.id,
    name: fullUser.name || "Anonymous",
    image: fullUser.image,
    since: fullUser.createdAt,
    aggregate: {
      activitiesOrganized: coordinated?.count || 0,
      eventsAttended: attended?.count || 0,
      groups: memberships.length,
      uniquePeopleReached: Number(uniqueAttendees?.count) || 0,
      journalEntries: journalCount?.count || 0,
      contributions: contribCount?.count || 0,
      signaturesGiven: signaturesGiven?.count || 0,
      signaturesReceived: signaturesReceived?.count || 0,
    },
    groups: groupData,
    crossFeed: crossFeed.slice(0, 10),
  });
}
