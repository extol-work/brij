import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, attendances } from "@/db/schema";
import { authenticateBot } from "@/lib/bot-auth";
import { generateShareCode } from "@/lib/share-code";
import { validateText, truncate, limits } from "@/lib/validate";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const auth = await authenticateBot(req, "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { title, description, duration_minutes, location, platform_event_id, activity_type } = body;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const titleErr = validateText(title, "Title", limits.MAX_TITLE);
  if (titleErr) return NextResponse.json({ error: titleErr }, { status: 400 });
  const descErr = validateText(description, "Description", limits.MAX_DESCRIPTION);
  if (descErr) return NextResponse.json({ error: descErr }, { status: 400 });

  if (!duration_minutes || typeof duration_minutes !== "number" || duration_minutes < 1 || duration_minutes > 1440) {
    return NextResponse.json({ error: "duration_minutes must be between 1 and 1440" }, { status: 400 });
  }

  // Prevent duplicate creation from same platform event
  if (platform_event_id) {
    const existing = await db.query.activities.findFirst({
      where: and(
        eq(activities.groupId, auth.groupId),
        eq(activities.platformEventId, platform_event_id),
      ),
    });
    if (existing) {
      return NextResponse.json({ error: "Activity with this platform_event_id already exists" }, { status: 409 });
    }
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + duration_minutes * 60 * 1000);

  const [activity] = await db
    .insert(activities)
    .values({
      title: truncate(title, limits.MAX_TITLE),
      description: description ? truncate(description, limits.MAX_DESCRIPTION) : null,
      coordinatorId: auth.createdById,
      groupId: auth.groupId,
      status: "open",
      startsAt: now,
      endsAt,
      location: location || null,
      shareCode: generateShareCode(),
      platformEventId: platform_event_id || null,
      activityType: activity_type || null,
    })
    .returning();

  return NextResponse.json(
    {
      id: activity.id,
      title: activity.title,
      share_code: activity.shareCode,
      starts_at: activity.startsAt?.toISOString() ?? null,
      ends_at: activity.endsAt?.toISOString() ?? null,
      status: activity.status,
      card_url: activity.cardUrl,
    },
    { status: 201 }
  );
}
