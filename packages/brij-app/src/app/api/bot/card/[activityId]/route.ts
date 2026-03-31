import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, attendances, groups } from "@/db/schema";
import { authenticateBot } from "@/lib/bot-auth";
import { eq, and, sql } from "drizzle-orm";

type Params = { params: Promise<{ activityId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await authenticateBot(req, "read");
  if (auth instanceof NextResponse) return auth;

  const { activityId } = await params;

  const activity = await db.query.activities.findFirst({
    where: and(
      eq(activities.id, activityId),
      eq(activities.groupId, auth.groupId),
    ),
  });

  if (!activity) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendances)
    .where(
      and(
        eq(attendances.activityId, activityId),
        eq(attendances.status, "checked_in"),
      )
    );

  return NextResponse.json({
    title: activity.title,
    group_name: auth.group.name,
    image_url: activity.cardUrl,
    card_page: `https://brij.extol.work/card/${activityId}`,
    attendee_count: countRow?.count ?? 0,
    date: activity.startsAt
      ? activity.startsAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : null,
    verified: activity.status === "closed",
  });
}
