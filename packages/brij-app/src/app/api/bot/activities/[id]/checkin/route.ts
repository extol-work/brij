import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities, attendances, platformIdentities } from "@/db/schema";
import { authenticateBot } from "@/lib/bot-auth";
import { eq, and } from "drizzle-orm";

/** Max unclaimed attendances per platform identity before capping */
const MAX_UNCLAIMED_ATTENDANCES = 50;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await authenticateBot(req, "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();
  const { attendees } = body;

  // Validate attendees array exists and is non-empty
  if (!Array.isArray(attendees) || attendees.length === 0) {
    return NextResponse.json(
      { error: "attendees array required and must not be empty" },
      { status: 400 }
    );
  }

  // --- Sybil Fix #1: Batch array cap (tier-aware) ---
  if (attendees.length > auth.batchCap) {
    return NextResponse.json(
      { error: `Batch size ${attendees.length} exceeds maximum of ${auth.batchCap} for this group (${auth.tier} tier)` },
      { status: 400 }
    );
  }

  // Verify activity exists and belongs to this group
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
    return NextResponse.json({ error: "Activity is closed" }, { status: 400 });
  }

  let checkedIn = 0;
  let alreadyCheckedIn = 0;
  let skippedCapReached = 0;

  for (const attendee of attendees) {
    const { platform_user_id, display_name, joined_at, left_at } = attendee;

    if (!platform_user_id || typeof platform_user_id !== "string") continue;

    // Parse platform prefix: "discord:123456789" -> platform="discord", id="123456789"
    const colonIdx = platform_user_id.indexOf(":");
    if (colonIdx === -1) continue;
    const platform = platform_user_id.slice(0, colonIdx);
    const platformId = platform_user_id.slice(colonIdx + 1);
    if (!platform || !platformId) continue;

    // Find or create platform identity
    let platformIdentity = await db.query.platformIdentities.findFirst({
      where: and(
        eq(platformIdentities.platform, platform),
        eq(platformIdentities.platformUserId, platformId),
        eq(platformIdentities.groupId, auth.groupId),
      ),
    });

    if (!platformIdentity) {
      const [created] = await db
        .insert(platformIdentities)
        .values({
          platform,
          platformUserId: platformId,
          platformUsername: display_name || null,
          groupId: auth.groupId,
        })
        .returning();
      platformIdentity = created;
    } else if (display_name && display_name !== platformIdentity.platformUsername) {
      // Update display name if changed
      await db
        .update(platformIdentities)
        .set({ platformUsername: display_name })
        .where(eq(platformIdentities.id, platformIdentity.id));
    }

    // Dedup: skip if already checked in to this activity
    const existing = await db.query.attendances.findFirst({
      where: and(
        eq(attendances.activityId, id),
        eq(attendances.platformIdentityId, platformIdentity.id),
      ),
    });

    if (existing) {
      alreadyCheckedIn++;
      continue;
    }

    // --- Sybil Fix #2a: Unclaimed attendance cap ---
    if (!platformIdentity.userId && platformIdentity.unclaimedAttendanceCount >= MAX_UNCLAIMED_ATTENDANCES) {
      skippedCapReached++;
      continue;
    }

    // Create attendance record
    const now = new Date();
    await db.insert(attendances).values({
      activityId: id,
      userId: platformIdentity.userId || null,
      guestName: platformIdentity.userId ? null : (display_name || null),
      platformIdentityId: platformIdentity.id,
      status: "checked_in",
      checkedInAt: joined_at ? new Date(joined_at) : now,
    });

    // Increment unclaimed counter if identity is not claimed
    if (!platformIdentity.userId) {
      await db
        .update(platformIdentities)
        .set({ unclaimedAttendanceCount: platformIdentity.unclaimedAttendanceCount + 1 })
        .where(eq(platformIdentities.id, platformIdentity.id));
    }

    checkedIn++;
  }

  return NextResponse.json({
    checked_in: checkedIn,
    already_checked_in: alreadyCheckedIn,
    skipped_cap_reached: skippedCapReached,
    activity_id: id,
  });
}
