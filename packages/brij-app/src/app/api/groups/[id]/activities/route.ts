import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { activities, attendances, groupMemberships } from "@/db/schema";
import { eq, and, desc, sql, isNotNull } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

/** GET /api/groups/:id/activities — list group-scoped activities with user's attendance */
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;

  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, groupId),
      eq(groupMemberships.userId, user.id),
      eq(groupMemberships.status, "active")
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const rows = await db
    .select({
      id: activities.id,
      title: activities.title,
      status: activities.status,
      startsAt: activities.startsAt,
      location: activities.location,
      closedAt: activities.closedAt,
      shareCode: activities.shareCode,
      isPrivate: activities.isPrivate,
      coordinatorId: activities.coordinatorId,
      cardUrl: activities.cardUrl,
    })
    .from(activities)
    .where(eq(activities.groupId, groupId))
    .orderBy(desc(activities.startsAt));

  // Get attendance counts per activity (separate query to avoid correlated subquery issues)
  const activityIds = rows.map((r) => r.id);
  let attendanceCounts = new Map<string, number>();
  if (activityIds.length > 0) {
    const counts = await db
      .select({
        activityId: attendances.activityId,
        count: sql<number>`count(*)::int`,
      })
      .from(attendances)
      .where(and(
        sql`${attendances.activityId} IN (${sql.join(activityIds.map(id => sql`${id}`), sql`, `)})`,
        eq(attendances.status, "checked_in"),
        isNotNull(attendances.userId)
      ))
      .groupBy(attendances.activityId);
    attendanceCounts = new Map(counts.map((c) => [c.activityId, c.count]));
  }

  // Get user's attendance for each activity
  const userAttendances = await db
    .select({
      activityId: attendances.activityId,
      status: attendances.status,
    })
    .from(attendances)
    .where(eq(attendances.userId, user.id));

  const attendanceMap = new Map(userAttendances.map((a) => [a.activityId, a.status]));

  const enriched = rows
    .filter((r) => {
      // Private events: only visible to coordinator or invited members
      if (r.isPrivate) {
        return r.coordinatorId === user.id || attendanceMap.has(r.id);
      }
      return true;
    })
    .map((r) => ({
      ...r,
      attendeeCount: attendanceCounts.get(r.id) ?? 0,
      myStatus: attendanceMap.get(r.id) || null,
    }));

  return NextResponse.json(enriched);
}

/** POST /api/groups/:id/activities — RSVP or check-in to a group event */
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;

  // Verify group membership
  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, groupId),
      eq(groupMemberships.userId, user.id),
      eq(groupMemberships.status, "active")
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const body = await req.json();
  const { activityId, action } = body; // action: "rsvp" or "checkin"

  if (!activityId || !action) {
    return NextResponse.json({ error: "activityId and action required" }, { status: 400 });
  }

  // Verify activity belongs to this group
  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, activityId), eq(activities.groupId, groupId)),
  });

  if (!activity) {
    return NextResponse.json({ error: "Activity not found in this group" }, { status: 404 });
  }

  if (activity.status !== "open") {
    return NextResponse.json({ error: "Activity is not open" }, { status: 400 });
  }

  // Check if already attending
  const existing = await db.query.attendances.findFirst({
    where: and(eq(attendances.activityId, activityId), eq(attendances.userId, user.id)),
  });

  if (action === "rsvp") {
    if (existing) {
      return NextResponse.json({ status: existing.status, message: "Already joined" });
    }
    const [attendance] = await db
      .insert(attendances)
      .values({
        activityId,
        userId: user.id,
        status: "coming",
      })
      .returning();
    return NextResponse.json(attendance, { status: 201 });
  }

  if (action === "checkin") {
    if (existing && existing.status === "checked_in") {
      return NextResponse.json({ status: "checked_in", message: "Already checked in" });
    }
    if (existing) {
      // Update existing RSVP to checked_in
      const [updated] = await db
        .update(attendances)
        .set({ status: "checked_in", checkedInAt: new Date() })
        .where(eq(attendances.id, existing.id))
        .returning();
      return NextResponse.json(updated);
    }
    // No RSVP — create directly as checked_in
    const [attendance] = await db
      .insert(attendances)
      .values({
        activityId,
        userId: user.id,
        status: "checked_in",
        checkedInAt: new Date(),
      })
      .returning();
    return NextResponse.json(attendance, { status: 201 });
  }

  return NextResponse.json({ error: "action must be 'rsvp' or 'checkin'" }, { status: 400 });
}
