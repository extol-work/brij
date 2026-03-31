import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, attendances } from "@/db/schema";
import { authenticateBot } from "@/lib/bot-auth";
import { eq, and, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const auth = await authenticateBot(req, "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const activity = await db.query.activities.findFirst({
    where: and(
      eq(activities.id, id),
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
        eq(attendances.activityId, id),
        eq(attendances.status, "checked_in"),
      )
    );

  return NextResponse.json({
    id: activity.id,
    title: activity.title,
    status: activity.status,
    starts_at: activity.startsAt?.toISOString() ?? null,
    ends_at: activity.endsAt?.toISOString() ?? null,
    attendee_count: countRow?.count ?? 0,
    card_url: activity.cardUrl,
    card_page: `https://brij.extol.work/card/${activity.id}`,
    share_code: activity.shareCode,
  });
}
