import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, attendances } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { generateShareCode } from "@/lib/share-code";
import { eq, or } from "drizzle-orm";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Activities I created
  const created = await db.query.activities.findMany({
    where: eq(activities.coordinatorId, user.id),
    orderBy: (a, { desc }) => [desc(a.createdAt)],
  });

  // Activities I attended (but didn't create)
  const attendedRows = await db
    .select({ activityId: attendances.activityId })
    .from(attendances)
    .where(eq(attendances.userId, user.id));

  const attendedIds = attendedRows
    .map((r) => r.activityId)
    .filter((id) => !created.some((c) => c.id === id));

  let attended: typeof created = [];
  if (attendedIds.length > 0) {
    attended = await db.query.activities.findMany({
      where: or(...attendedIds.map((id) => eq(activities.id, id))),
      orderBy: (a, { desc }) => [desc(a.createdAt)],
    });
  }

  return NextResponse.json({
    created,
    attended,
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, description, startsAt, endsAt, location, isRecurring, recurringFrequency } = body;

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const [activity] = await db
    .insert(activities)
    .values({
      title,
      description: description || null,
      coordinatorId: user.id,
      status: "open",
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
      location: location || null,
      shareCode: generateShareCode(),
      isRecurring: isRecurring || false,
      recurringFrequency: isRecurring ? recurringFrequency || null : null,
    })
    .returning();

  // Set seriesId to own id for first activity in a recurring series
  if (activity.isRecurring) {
    await db.update(activities).set({ seriesId: activity.id }).where(eq(activities.id, activity.id));
    activity.seriesId = activity.id;
  }

  // Auto-RSVP the creator as "coming"
  await db.insert(attendances).values({
    activityId: activity.id,
    userId: user.id,
    status: "coming",
  });

  return NextResponse.json(activity, { status: 201 });
}
