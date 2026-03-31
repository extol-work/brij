import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, attendances, users } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
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

  const records = await db
    .select({
      id: attendances.id,
      guestName: attendances.guestName,
      status: attendances.status,
      rsvpAt: attendances.rsvpAt,
      checkedInAt: attendances.checkedInAt,
      userId: attendances.userId,
      displayName: users.name,
      email: users.email,
    })
    .from(attendances)
    .leftJoin(users, eq(attendances.userId, users.id))
    .where(eq(attendances.activityId, id));

  const attendees = records.map((r) => ({
    id: r.id,
    userId: r.userId || null,
    name: r.displayName || r.email || r.guestName || "Anonymous",
    status: r.status,
    rsvpAt: r.rsvpAt,
    checkedInAt: r.checkedInAt,
    isGuest: !r.userId,
  }));

  return NextResponse.json(attendees);
}

// PATCH: mark an attendee as checked_in (coordinator only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
  const { attendanceId, status } = body;

  if (!attendanceId || status !== "checked_in") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const [updated] = await db
    .update(attendances)
    .set({
      status: "checked_in",
      checkedInAt: new Date(),
    })
    .where(and(
      eq(attendances.id, attendanceId),
      eq(attendances.activityId, id)
    ))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Attendance not found" }, { status: 404 });
  }

  return NextResponse.json(updated);
}

// POST: coordinator on-behalf check-in (add a walk-up guest)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
    return NextResponse.json({ error: "Activity is not open" }, { status: 400 });
  }

  const body = await req.json();
  const { guestName } = body;

  if (!guestName || !guestName.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const [attendance] = await db
    .insert(attendances)
    .values({
      activityId: id,
      guestName: guestName.trim(),
      status: "checked_in",
      checkedInAt: new Date(),
    })
    .returning();

  return NextResponse.json(attendance, { status: 201 });
}
