import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, attendances, users } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

// GET: look up activity by share code (public, no auth required)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const activity = await db.query.activities.findFirst({
    where: eq(activities.shareCode, code),
  });

  if (!activity || activity.status !== "open") {
    return NextResponse.json({ error: "Activity not found or closed" }, { status: 404 });
  }

  const attendeeList = await db
    .select({
      id: attendances.id,
      guestName: attendances.guestName,
      userId: attendances.userId,
      status: attendances.status,
      displayName: users.name,
      email: users.email,
    })
    .from(attendances)
    .leftJoin(users, eq(attendances.userId, users.id))
    .where(eq(attendances.activityId, activity.id));

  const attendees = attendeeList.map((r) => ({
    name: r.displayName || r.email || r.guestName || "Anonymous",
    isGuest: !r.userId,
    status: r.status,
  }));

  return NextResponse.json({
    id: activity.id,
    title: activity.title,
    description: activity.description,
    location: activity.location,
    startsAt: activity.startsAt,
    attendees,
  });
}

// POST: RSVP or check in to an activity
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const activity = await db.query.activities.findFirst({
    where: eq(activities.shareCode, code),
  });

  if (!activity || activity.status !== "open") {
    return NextResponse.json({ error: "Activity not found or closed" }, { status: 404 });
  }

  const body = await req.json();
  const { guestName, checkin } = body;
  const status = checkin ? "checked_in" : "coming";

  const authUser = await getAuthUser();
  let userId: string | null = null;

  if (authUser) {
    userId = authUser.id;

    // Check if user already has a record
    const existing = await db.query.attendances.findFirst({
      where: and(
        eq(attendances.activityId, activity.id),
        eq(attendances.userId, userId)
      ),
    });
    if (existing) {
      // If checking in and currently "coming", upgrade to checked_in
      if (checkin && existing.status === "coming") {
        const [updated] = await db
          .update(attendances)
          .set({ status: "checked_in", checkedInAt: new Date() })
          .where(eq(attendances.id, existing.id))
          .returning();
        return NextResponse.json(updated);
      }
      return NextResponse.json(existing);
    }
  }

  if (!userId && !guestName) {
    return NextResponse.json(
      { error: "Either sign in or provide a guest name" },
      { status: 400 }
    );
  }

  const [attendance] = await db
    .insert(attendances)
    .values({
      activityId: activity.id,
      userId,
      guestName: userId ? null : guestName,
      status,
      ...(checkin ? { checkedInAt: new Date() } : {}),
    })
    .returning();

  return NextResponse.json(attendance, { status: 201 });
}
