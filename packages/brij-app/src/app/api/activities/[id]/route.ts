import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, attendances } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { generateShareCode } from "@/lib/share-code";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const activity = await db.query.activities.findFirst({
    where: eq(activities.id, id),
  });

  if (!activity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Auto-close: if endsAt has passed and activity is still open, close it
  if (activity.status === "open" && activity.endsAt && new Date(activity.endsAt) < new Date()) {
    const [closed] = await db
      .update(activities)
      .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
      .where(eq(activities.id, id))
      .returning();
    return NextResponse.json(closed);
  }

  return NextResponse.json(activity);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), eq(activities.coordinatorId, user.id)),
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found or not owner" }, { status: 404 });
  }

  const body = await req.json();
  const { title, description, status, startsAt, endsAt, location, isRecurring, recurringFrequency, summary, sentiment, activityType } = body;

  const [updated] = await db
    .update(activities)
    .set({
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(startsAt !== undefined && { startsAt: startsAt ? new Date(startsAt) : null }),
      ...(endsAt !== undefined && { endsAt: endsAt ? new Date(endsAt) : null }),
      ...(location !== undefined && { location }),
      ...(isRecurring !== undefined && { isRecurring }),
      ...(recurringFrequency !== undefined && { recurringFrequency: recurringFrequency || null }),
      ...(activityType !== undefined && { activityType: activityType || null }),
      ...(summary !== undefined && { summary }),
      ...(sentiment !== undefined && { sentiment }),
      ...(status === "closed" && !existing.closedAt && { closedAt: new Date() }),
      updatedAt: new Date(),
    })
    .where(eq(activities.id, id))
    .returning();

  // Auto-create next occurrence when closing a recurring activity
  if (status === "closed" && existing.isRecurring && existing.recurringFrequency && existing.startsAt) {
    const nextDate = computeNextDate(existing.startsAt, existing.recurringFrequency);
    const [nextActivity] = await db
      .insert(activities)
      .values({
        title: existing.title,
        description: existing.description,
        coordinatorId: existing.coordinatorId,
        status: "open",
        startsAt: nextDate,
        endsAt: null,
        location: existing.location,
        shareCode: generateShareCode(),
        isRecurring: true,
        recurringFrequency: existing.recurringFrequency,
        seriesId: existing.seriesId || existing.id,
      })
      .returning();

    // Auto-RSVP all registered attendees — same crew carries forward, they can drop out
    const allAttendees = await db.query.attendances.findMany({
      where: eq(attendances.activityId, id),
    });
    const rsvpValues = allAttendees
      .filter((a) => a.userId) // skip anonymous guests
      .map((a) => ({
        activityId: nextActivity.id,
        userId: a.userId!,
        status: "coming" as const,
      }));
    // Add coordinator if not already in the list
    if (!rsvpValues.some((r) => r.userId === existing.coordinatorId)) {
      rsvpValues.push({
        activityId: nextActivity.id,
        userId: existing.coordinatorId,
        status: "coming",
      });
    }
    if (rsvpValues.length > 0) {
      await db.insert(attendances).values(rsvpValues);
    }

    return NextResponse.json({ ...updated, nextActivity });
  }

  return NextResponse.json(updated);
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
