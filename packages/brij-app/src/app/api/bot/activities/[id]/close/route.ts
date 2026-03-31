import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, attendances } from "@/db/schema";
import { authenticateBot } from "@/lib/bot-auth";
import { eq, and, sql } from "drizzle-orm";
import { pushActivityClosed } from "@/lib/event-close";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await authenticateBot(req, "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { summary, sentiment } = body;

  const activity = await db.query.activities.findFirst({
    where: and(
      eq(activities.id, id),
      eq(activities.groupId, auth.groupId),
    ),
  });

  if (!activity) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  if (activity.status === "closed") {
    return NextResponse.json({ error: "Activity already closed" }, { status: 400 });
  }

  const now = new Date();

  await db
    .update(activities)
    .set({
      status: "closed",
      closedAt: now,
      updatedAt: now,
      summary: summary || activity.summary,
      sentiment: sentiment || activity.sentiment,
    })
    .where(eq(activities.id, id));

  // Count checked-in attendees
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(attendances)
    .where(
      and(
        eq(attendances.activityId, id),
        eq(attendances.status, "checked_in"),
      )
    );

  // Push to Cortex for attestation (fire and forget)
  pushActivityClosed(id, auth.groupId, now, auth.createdById);

  return NextResponse.json({
    id,
    status: "closed",
    closed_at: now.toISOString(),
    attendee_count: countRow?.count ?? 0,
    card_url: activity.cardUrl,
    card_page: `https://brij.extol.work/card/${id}`,
  });
}
