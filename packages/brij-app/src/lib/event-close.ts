/**
 * Event close helper — collects attendees and pushes to Cortex.
 *
 * Called on manual close, auto-close cron, and bot close.
 * Builds derivation inputs for each attendee and fires the push.
 */

import { db } from "@/db";
import { attendances, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { pushEventClosed } from "@/lib/cortex";

function getRotationEpoch(): number {
  // 30-day epochs (2,592,000 seconds)
  return Math.floor(Date.now() / 1000 / 2592000);
}

export async function pushActivityClosed(
  activityId: string,
  groupId: string | null,
  closedAt: Date
) {
  if (!groupId) return; // Personal activities (no group) don't get attested

  const epoch = getRotationEpoch();

  // Fetch all checked-in attendees for this activity
  const checkins = await db.query.attendances.findMany({
    where: and(
      eq(attendances.activityId, activityId),
      eq(attendances.status, "checked_in"),
    ),
  });

  if (checkins.length === 0) return;

  // Build attendee list with derivation inputs
  const attendeeList: { derivationInput: string; displayName: string; joinedAt: string | null }[] = [];

  for (const checkin of checkins) {
    let derivationInput: string;
    let displayName: string;

    if (checkin.userId) {
      // brij user — derive from userId
      derivationInput = `${groupId}:${checkin.userId}:${epoch}`;
      // Fetch display name
      const user = await db.query.users.findFirst({
        where: eq(users.id, checkin.userId),
      });
      displayName = user?.name || user?.email || "Member";
    } else if (checkin.guestName) {
      // Guest check-in — no attestation (no stable identity to derive from)
      // Skip guests per existing policy
      continue;
    } else {
      continue;
    }

    attendeeList.push({
      derivationInput,
      displayName,
      joinedAt: checkin.checkedInAt?.toISOString() || null,
    });
  }

  if (attendeeList.length === 0) return;

  // Push to Cortex — fire and forget
  pushEventClosed(
    activityId,
    groupId,
    closedAt.toISOString(),
    attendeeList,
    "free" // Default to free tier until EXT-149 community plans
  ).catch(() => {});
}
