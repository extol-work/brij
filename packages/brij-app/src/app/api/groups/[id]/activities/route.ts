import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { activities, attendances, groupMemberships } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

/** GET /api/groups/:id/activities — list group-scoped activities */
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
      attendeeCount: sql<number>`(SELECT count(*) FROM attendances WHERE activity_id = ${activities.id} AND status = 'checked_in')::int`,
    })
    .from(activities)
    .where(eq(activities.groupId, groupId))
    .orderBy(desc(activities.startsAt));

  return NextResponse.json(rows);
}
