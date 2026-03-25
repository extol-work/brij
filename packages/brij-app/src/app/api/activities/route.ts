import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, attendances, groups } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { generateShareCode } from "@/lib/share-code";
import { eq, or, and, lt, isNotNull, sql } from "drizzle-orm";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Auto-close stale activities before listing
  const now = new Date();
  try {
    await db
      .update(activities)
      .set({ status: "closed", closedAt: now, updatedAt: now })
      .where(
        and(
          eq(activities.coordinatorId, user.id),
          eq(activities.status, "open"),
          isNotNull(activities.endsAt),
          lt(activities.endsAt, now),
        )
      );
  } catch {
    // Don't let sweep failure break the dashboard
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

  // Enrich with attendee counts
  const allActivities = [...created, ...attended];
  const countMap = new Map<string, number>();
  if (allActivities.length > 0) {
    const counts = await db
      .select({
        activityId: attendances.activityId,
        count: sql<number>`count(*)::int`,
      })
      .from(attendances)
      .where(eq(attendances.status, "checked_in"))
      .groupBy(attendances.activityId);
    for (const c of counts) {
      countMap.set(c.activityId, c.count);
    }
  }

  // Resolve group names
  const groupIds = [...new Set(allActivities.map((a) => a.groupId).filter(Boolean))] as string[];
  const groupNameMap = new Map<string, string>();
  if (groupIds.length > 0) {
    for (const gid of groupIds) {
      const g = await db.query.groups.findFirst({ where: eq(groups.id, gid) });
      if (g) groupNameMap.set(g.id, g.name);
    }
  }

  const enrich = (a: typeof created[number]) => ({
    ...a,
    attendeeCount: countMap.get(a.id) || 0,
    groupName: a.groupId ? groupNameMap.get(a.groupId) || null : null,
  });

  return NextResponse.json({
    created: created.map(enrich),
    attended: attended.map(enrich),
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { mode, title, description, startsAt, endsAt, location, isRecurring, recurringFrequency, groupId, isPrivate } = body;

  // "Now" mode: instant live activity with 12h auto-close
  if (mode === "now") {
    const now = new Date();
    const autoClose = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const [activity] = await db
      .insert(activities)
      .values({
        title: "Untitled activity",
        coordinatorId: user.id,
        groupId: groupId || null,
        status: "open",
        startsAt: now,
        endsAt: autoClose,
        shareCode: generateShareCode(),
      })
      .returning();

    // Auto-check-in the coordinator (they're there — that's why they tapped Now)
    await db.insert(attendances).values({
      activityId: activity.id,
      userId: user.id,
      status: "checked_in",
      checkedInAt: now,
    });

    return NextResponse.json(activity, { status: 201 });
  }

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const [activity] = await db
    .insert(activities)
    .values({
      title,
      description: description || null,
      coordinatorId: user.id,
      groupId: groupId || null,
      status: "open",
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : (startsAt ? new Date(new Date(startsAt).getTime() + 24 * 60 * 60 * 1000) : null),
      location: location || null,
      shareCode: generateShareCode(),
      isRecurring: isRecurring || false,
      recurringFrequency: isRecurring ? recurringFrequency || null : null,
      isPrivate: isPrivate || false,
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
