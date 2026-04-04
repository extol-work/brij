import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, attendances, platformIdentities } from "@/db/schema";
import { authenticateBot } from "@/lib/bot-auth";
import { generateShareCode } from "@/lib/share-code";
import { validateText, truncate, limits } from "@/lib/validate";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const auth = await authenticateBot(req, "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { title, description, duration_minutes, location, platform_event_id, activity_type, platform_user_id } = body;

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

  // Resolve creator identity from platform_user_id (e.g. "discord:123456789")
  let coordinatorId: string = auth.createdById;
  let createdByPlatformIdentityId: string | null = null;

  if (platform_user_id && typeof platform_user_id === "string") {
    const colonIdx = platform_user_id.indexOf(":");
    if (colonIdx !== -1) {
      const platform = platform_user_id.slice(0, colonIdx);
      const platformId = platform_user_id.slice(colonIdx + 1);

      let identity = await db.query.platformIdentities.findFirst({
        where: and(
          eq(platformIdentities.platform, platform),
          eq(platformIdentities.platformUserId, platformId),
          eq(platformIdentities.groupId, auth.groupId),
        ),
      });

      if (!identity) {
        const [created] = await db
          .insert(platformIdentities)
          .values({
            platform,
            platformUserId: platformId,
            groupId: auth.groupId,
          })
          .returning();
        identity = created;
      }

      createdByPlatformIdentityId = identity.id;
      // If linked to an Extol user, use them as coordinator
      if (identity.userId) {
        coordinatorId = identity.userId;
      }
    }
  }

  const now = new Date();
  const endsAt = new Date(now.getTime() + duration_minutes * 60 * 1000);

  const [activity] = await db
    .insert(activities)
    .values({
      title: truncate(title, limits.MAX_TITLE),
      description: description ? truncate(description, limits.MAX_DESCRIPTION) : null,
      coordinatorId,
      groupId: auth.groupId,
      status: "open",
      startsAt: now,
      endsAt,
      location: location || null,
      shareCode: generateShareCode(),
      platformEventId: platform_event_id || null,
      createdByPlatformIdentityId,
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
