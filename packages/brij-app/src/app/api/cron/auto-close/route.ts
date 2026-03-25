import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, attendances } from "@/db/schema";
import { eq, and, lt, isNotNull } from "drizzle-orm";
import { generateShareCode } from "@/lib/share-code";

/**
 * GET /api/cron/auto-close — close stale activities
 *
 * Closes all open activities where endsAt has passed.
 * For recurring activities, creates the next occurrence.
 * Runs hourly via Vercel Cron.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Find all stale open activities (don't close yet — need full rows for recurring logic)
  const stale = await db.query.activities.findMany({
    where: and(
      eq(activities.status, "open"),
      isNotNull(activities.endsAt),
      lt(activities.endsAt, now),
    ),
  });

  if (stale.length === 0) {
    return NextResponse.json({ closed: 0, created: 0 });
  }

  // Close them all
  const staleIds = stale.map((a) => a.id);
  await db
    .update(activities)
    .set({ status: "closed", closedAt: now, updatedAt: now })
    .where(
      and(
        eq(activities.status, "open"),
        isNotNull(activities.endsAt),
        lt(activities.endsAt, now),
      )
    );

  // Auto-create next occurrence for recurring activities
  let created = 0;
  for (const activity of stale) {
    if (activity.isRecurring && activity.recurringFrequency && activity.startsAt) {
      const nextDate = computeNextDate(activity.startsAt, activity.recurringFrequency);

      const [nextActivity] = await db
        .insert(activities)
        .values({
          title: activity.title,
          description: activity.description,
          coordinatorId: activity.coordinatorId,
          groupId: activity.groupId,
          status: "open",
          startsAt: nextDate,
          endsAt: new Date(nextDate.getTime() + 24 * 60 * 60 * 1000),
          location: activity.location,
          shareCode: generateShareCode(),
          isRecurring: true,
          recurringFrequency: activity.recurringFrequency,
          seriesId: activity.seriesId || activity.id,
        })
        .returning();

      // Auto-RSVP all registered attendees
      const allAttendees = await db.query.attendances.findMany({
        where: eq(attendances.activityId, activity.id),
      });
      const rsvpValues = allAttendees
        .filter((a) => a.userId)
        .map((a) => ({
          activityId: nextActivity.id,
          userId: a.userId!,
          status: "coming" as const,
        }));
      if (!rsvpValues.some((r) => r.userId === activity.coordinatorId)) {
        rsvpValues.push({
          activityId: nextActivity.id,
          userId: activity.coordinatorId,
          status: "coming",
        });
      }
      if (rsvpValues.length > 0) {
        await db.insert(attendances).values(rsvpValues);
      }

      created++;
    }
  }

  console.log(`[cron:auto-close] Closed ${stale.length}, created ${created} next occurrences`);

  return NextResponse.json({ closed: stale.length, created });
}

function computeNextDate(current: Date, frequency: string): Date {
  const next = new Date(current);
  switch (frequency) {
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "biweekly":
      next.setDate(next.getDate() + 14);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
  }
  return next;
}
