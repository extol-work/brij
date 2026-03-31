import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, attendances, users } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

/** GET /api/activities/:id/coordinators — list coordinators for this activity */
export async function GET(
  _req: NextRequest,
  { params }: Params
) {
  const { id } = await params;

  const activity = await db.query.activities.findFirst({
    where: eq(activities.id, id),
  });
  if (!activity) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Find all attendance records with role=coordinator
  const coordinatorAttendances = await db.query.attendances.findMany({
    where: and(
      eq(attendances.activityId, id),
      eq(attendances.role, "coordinator"),
    ),
  });

  // Resolve user info
  const result = [];
  for (const att of coordinatorAttendances) {
    if (!att.userId) continue;
    const user = await db.query.users.findFirst({
      where: eq(users.id, att.userId),
    });
    result.push({
      userId: att.userId,
      name: user?.name || user?.email || "Member",
      isCreator: att.userId === activity.coordinatorId,
    });
  }

  // Always include the activity creator even if they don't have an attendance record yet
  if (!result.some((r) => r.userId === activity.coordinatorId)) {
    const creator = await db.query.users.findFirst({
      where: eq(users.id, activity.coordinatorId),
    });
    result.unshift({
      userId: activity.coordinatorId,
      name: creator?.name || creator?.email || "Creator",
      isCreator: true,
    });
  }

  return NextResponse.json(result);
}

/** POST /api/activities/:id/coordinators — add a coordinator */
export async function POST(
  req: NextRequest,
  { params }: Params
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), eq(activities.coordinatorId, user.id)),
  });
  if (!activity) {
    return NextResponse.json({ error: "Not found or not owner" }, { status: 404 });
  }
  if (activity.status !== "open") {
    return NextResponse.json({ error: "Activity is closed" }, { status: 400 });
  }

  const body = await req.json();
  const { userId } = body;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  // Check coordinator cap (max 5)
  const existing = await db.query.attendances.findMany({
    where: and(
      eq(attendances.activityId, id),
      eq(attendances.role, "coordinator"),
    ),
  });
  // Count creator even if they don't have an attendance record
  const currentCount = existing.some((a) => a.userId === activity.coordinatorId)
    ? existing.length
    : existing.length + 1;

  if (currentCount >= 5) {
    return NextResponse.json({ error: "Maximum 5 coordinators per activity" }, { status: 400 });
  }

  // Check if user already has an attendance record
  const existingAttendance = await db.query.attendances.findFirst({
    where: and(
      eq(attendances.activityId, id),
      eq(attendances.userId, userId),
    ),
  });

  if (existingAttendance) {
    if (existingAttendance.role === "coordinator") {
      return NextResponse.json({ error: "Already a coordinator" }, { status: 409 });
    }
    // Promote existing attendee to coordinator
    await db
      .update(attendances)
      .set({ role: "coordinator" })
      .where(eq(attendances.id, existingAttendance.id));
  } else {
    // Create new attendance as coordinator with RSVP
    await db.insert(attendances).values({
      activityId: id,
      userId,
      status: "coming",
      role: "coordinator",
    });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}

/** DELETE /api/activities/:id/coordinators — remove a coordinator */
export async function DELETE(
  req: NextRequest,
  { params }: Params
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), eq(activities.coordinatorId, user.id)),
  });
  if (!activity) {
    return NextResponse.json({ error: "Not found or not owner" }, { status: 404 });
  }

  const body = await req.json();
  const { userId } = body;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  // Cannot remove the activity creator
  if (userId === activity.coordinatorId) {
    return NextResponse.json({ error: "Cannot remove the activity creator" }, { status: 400 });
  }

  // Demote to participant
  const attendance = await db.query.attendances.findFirst({
    where: and(
      eq(attendances.activityId, id),
      eq(attendances.userId, userId),
      eq(attendances.role, "coordinator"),
    ),
  });

  if (!attendance) {
    return NextResponse.json({ error: "Not a coordinator" }, { status: 404 });
  }

  await db
    .update(attendances)
    .set({ role: "participant" })
    .where(eq(attendances.id, attendance.id));

  return NextResponse.json({ ok: true });
}
