/**
 * Event close helper — collects attendees and pushes to Cortex.
 *
 * Called on manual close, auto-close cron, and bot close.
 * Builds derivation inputs for each attendee and fires the push.
 */

import { db } from "@/db";
import { activities, attendances, users, platformIdentities } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { pushEventClosed } from "@/lib/cortex";
import { getGroupTier } from "@/lib/community-plan";

function getRotationEpoch(): number {
  // 30-day epochs (2,592,000 seconds)
  return Math.floor(Date.now() / 1000 / 2592000);
}

export async function pushActivityClosed(
  activityId: string,
  groupId: string | null,
  closedAt: Date,
  coordinatorId?: string
) {
  // Community context: group ID for group activities, coordinator ID for personal
  const communityId = groupId || coordinatorId;
  if (!communityId) return;

  const epoch = getRotationEpoch();

  // Fetch all checked-in attendees for this activity
  const checkins = await db.query.attendances.findMany({
    where: and(
      eq(attendances.activityId, activityId),
      eq(attendances.status, "checked_in"),
    ),
  });

  // Build attendee list with derivation inputs
  const attendeeList: { derivationInput: string; displayName: string; joinedAt: string | null; role: "participant" | "coordinator" }[] = [];

  // Track whether the creator appears in check-ins
  let creatorIncluded = false;

  for (const checkin of checkins) {
    let derivationInput: string;
    let displayName: string;

    if (checkin.userId) {
      // brij user — derive from userId
      derivationInput = `${communityId}:${checkin.userId}:${epoch}`;
      // Fetch display name
      const user = await db.query.users.findFirst({
        where: eq(users.id, checkin.userId),
      });
      displayName = user?.name || user?.email || "Member";
      if (checkin.userId === coordinatorId) creatorIncluded = true;
    } else if (checkin.platformIdentityId) {
      // Platform identity (bot-originated) — derive from platform prefix
      const pi = await db.query.platformIdentities.findFirst({
        where: eq(platformIdentities.id, checkin.platformIdentityId),
      });
      if (!pi) continue;
      // HMAC derivation input: communityId:platform:platformUserId:epoch
      derivationInput = `${communityId}:${pi.platform}:${pi.platformUserId}:${epoch}`;
      displayName = pi.platformUsername || `${pi.platform}:${pi.platformUserId}`;
    } else if (checkin.guestName) {
      // Guest check-in — no attestation (no stable identity to derive from)
      // Skip guests per existing policy
      continue;
    } else {
      continue;
    }

    // Role from attendance record, or coordinator if they're the activity creator
    const role = checkin.role === "coordinator" || checkin.userId === coordinatorId
      ? "coordinator" as const
      : "participant" as const;

    attendeeList.push({
      derivationInput,
      displayName,
      joinedAt: checkin.checkedInAt?.toISOString() || null,
      role,
    });
  }

  // Always inject creator as coordinator if they weren't already in check-ins
  if (coordinatorId && !creatorIncluded) {
    const creator = await db.query.users.findFirst({
      where: eq(users.id, coordinatorId),
    });
    if (creator) {
      attendeeList.push({
        derivationInput: `${communityId}:${coordinatorId}:${epoch}`,
        displayName: creator.name || creator.email || "Coordinator",
        joinedAt: closedAt.toISOString(),
        role: "coordinator",
      });
    }
  }

  if (attendeeList.length === 0) return;

  // Look up community tier for attestation routing
  const tier = groupId ? await getGroupTier(groupId) : "free";
  const cortexTier = tier === "free" ? "free" : "paid";

  // Mark activity as pending attestation
  await db.update(activities).set({ attestationStatus: "pending" }).where(eq(activities.id, activityId));

  // Push to Cortex — fire and forget
  pushEventClosed(
    activityId,
    communityId,
    closedAt.toISOString(),
    attendeeList,
    cortexTier
  ).catch(() => {});
}
