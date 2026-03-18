/**
 * Milestone detection logic.
 *
 * 4 milestones, each earned once per group:
 * 1. first_activity_3plus — first closed activity with 3+ checked-in attendees
 * 2. first_active_week — first week with activity + journal entries from 2+ members
 * 3. streak_10 — 10 consecutive weeks with at least one closed activity
 * 4. streak_25 — 25 consecutive weeks with at least one closed activity
 */

import { db } from "@/db";
import {
  milestones,
  activities,
  attendances,
  journalEntries,
  groups,
} from "@/db/schema";
import { eq, and, sql, gte, isNull } from "drizzle-orm";

type MilestoneType = "first_activity_3plus" | "first_active_week" | "streak_10" | "streak_25";

async function hasMilestone(groupId: string, type: MilestoneType): Promise<boolean> {
  const existing = await db.query.milestones.findFirst({
    where: and(eq(milestones.groupId, groupId), eq(milestones.type, type)),
  });
  return !!existing;
}

async function awardMilestone(groupId: string, type: MilestoneType): Promise<boolean> {
  try {
    await db.insert(milestones).values({ groupId, type });
    console.log(`[milestone] Awarded ${type} to group ${groupId}`);
    return true;
  } catch {
    // Unique constraint — already earned
    return false;
  }
}

/**
 * Check milestone #1: first activity with 3+ attendees.
 * Called on activity close (event-driven).
 */
export async function checkFirstActivity3Plus(groupId: string, activityId: string): Promise<boolean> {
  if (await hasMilestone(groupId, "first_activity_3plus")) return false;

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendances)
    .where(
      and(
        eq(attendances.activityId, activityId),
        eq(attendances.status, "checked_in")
      )
    );

  if (result.count >= 3) {
    return awardMilestone(groupId, "first_activity_3plus");
  }
  return false;
}

/**
 * Check milestone #2: first week with activity + journal from 2+ members.
 * Called by daily cron.
 */
export async function checkFirstActiveWeek(groupId: string): Promise<boolean> {
  if (await hasMilestone(groupId, "first_active_week")) return false;

  // Look at the past 7 days
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Has at least 1 closed activity this week?
  const [actResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activities)
    .where(
      and(
        eq(activities.groupId, groupId),
        eq(activities.status, "closed"),
        gte(activities.closedAt, weekAgo)
      )
    );

  if (actResult.count === 0) return false;

  // Journal entries from 2+ distinct members this week?
  const [journalResult] = await db
    .select({ members: sql<number>`count(DISTINCT author_id)::int` })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.groupId, groupId),
        isNull(journalEntries.deletedAt),
        gte(journalEntries.createdAt, weekAgo)
      )
    );

  if (journalResult.members >= 2) {
    return awardMilestone(groupId, "first_active_week");
  }
  return false;
}

/**
 * Check streak milestones (#3 and #4).
 * Counts consecutive weeks (Mon-Sun) with at least one closed activity.
 * Called by daily cron.
 */
export async function checkStreakMilestones(groupId: string): Promise<string[]> {
  const awarded: string[] = [];

  // Get all weeks that have at least one closed activity
  const weeks = await db.execute(sql`
    SELECT DISTINCT date_trunc('week', closed_at) as week_start
    FROM activities
    WHERE group_id = ${groupId}
      AND status = 'closed'
      AND closed_at IS NOT NULL
    ORDER BY week_start DESC
  `) as unknown as Array<{ week_start: string }>;

  if (weeks.length === 0) return awarded;

  // Count consecutive weeks from most recent
  let streak = 1;
  for (let i = 1; i < weeks.length; i++) {
    const current = new Date(weeks[i - 1].week_start);
    const prev = new Date(weeks[i].week_start);
    const diffDays = (current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

    if (Math.abs(diffDays - 7) <= 1) {
      // Consecutive week (allow 1 day tolerance for timezone)
      streak++;
    } else {
      break;
    }
  }

  if (streak >= 10 && !(await hasMilestone(groupId, "streak_10"))) {
    if (await awardMilestone(groupId, "streak_10")) awarded.push("streak_10");
  }
  if (streak >= 25 && !(await hasMilestone(groupId, "streak_25"))) {
    if (await awardMilestone(groupId, "streak_25")) awarded.push("streak_25");
  }

  return awarded;
}

/**
 * Run all cron-based milestone checks for all groups.
 */
export async function checkAllMilestones(): Promise<{ checked: number; awarded: number }> {
  const allGroups = await db.select({ id: groups.id }).from(groups);
  let awarded = 0;

  for (const group of allGroups) {
    if (await checkFirstActiveWeek(group.id)) awarded++;
    const streaks = await checkStreakMilestones(group.id);
    awarded += streaks.length;
  }

  return { checked: allGroups.length, awarded };
}

/**
 * Get milestone count for a group.
 */
export async function getMilestoneCount(groupId: string): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(milestones)
    .where(eq(milestones.groupId, groupId));
  return result.count;
}
