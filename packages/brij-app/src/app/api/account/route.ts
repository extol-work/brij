import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import {
  users,
  accounts,
  sessions,
  activities,
  attendances,
  contributions,
  peerAttestations,
  journalEntries,
  groupMemberships,
  groups,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * DELETE /api/account — delete all user data (EXT-35)
 *
 * Layer 1 (brij): cascade delete all user data from the database.
 * Layer 2 (middleware): purge identity-to-wallet linkage — future, when cortex is live.
 * Layer 3 (on-chain): attestation PDAs become orphaned — unlinkable by design (key rotation).
 */
export async function DELETE() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;

  // Check if user is sole coordinator of any group
  const coordinated = await db
    .select({ groupId: groupMemberships.groupId })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.userId, userId),
        eq(groupMemberships.role, "coordinator"),
        eq(groupMemberships.status, "active")
      )
    );

  for (const { groupId } of coordinated) {
    // Check if there are other active members
    const otherMembers = await db
      .select({ id: groupMemberships.id })
      .from(groupMemberships)
      .where(
        and(
          eq(groupMemberships.groupId, groupId),
          eq(groupMemberships.status, "active")
        )
      );

    // If sole coordinator and group has other members, block deletion
    const otherCoordinators = await db
      .select({ id: groupMemberships.id })
      .from(groupMemberships)
      .where(
        and(
          eq(groupMemberships.groupId, groupId),
          eq(groupMemberships.role, "coordinator"),
          eq(groupMemberships.status, "active")
        )
      );

    if (otherCoordinators.length === 1 && otherMembers.length > 1) {
      return NextResponse.json(
        {
          error: "You are the sole coordinator of a group with other members. Transfer coordinator role or remove members first.",
          groupId,
        },
        { status: 400 }
      );
    }
  }

  // Notify cortex middleware before cascade delete (GDPR PDA cleanup)
  // Cortex can't detect deletions by polling — we must push.
  const cortexUrl = process.env.CORTEX_URL;
  if (cortexUrl) {
    for (const { groupId } of coordinated) {
      try {
        await fetch(`${cortexUrl}/user-deleted`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: groupId, userId }),
        });
      } catch {
        // Best-effort — don't block account deletion if cortex is down
      }
    }
    // Also notify for groups where user is just a member
    const memberOf = await db
      .select({ groupId: groupMemberships.groupId })
      .from(groupMemberships)
      .where(
        and(
          eq(groupMemberships.userId, userId),
          eq(groupMemberships.role, "member"),
          eq(groupMemberships.status, "active")
        )
      );
    for (const { groupId } of memberOf) {
      try {
        await fetch(`${cortexUrl}/user-deleted`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ communityId: groupId, userId }),
        });
      } catch {
        // Best-effort
      }
    }
  }

  // Perform deletion in order (respecting FK constraints)
  // 1. Peer attestations (where user is attester or attestee)
  await db.delete(peerAttestations).where(eq(peerAttestations.attesterId, userId));
  await db.delete(peerAttestations).where(eq(peerAttestations.attesteeId, userId));

  // 2. Contributions
  await db.delete(contributions).where(eq(contributions.userId, userId));

  // 3. Attendances
  await db.delete(attendances).where(eq(attendances.userId, userId));

  // 4. Journal entries (hard delete — per wireframe "delete means deleted")
  await db.delete(journalEntries).where(eq(journalEntries.authorId, userId));

  // 5. Group memberships
  await db.delete(groupMemberships).where(eq(groupMemberships.userId, userId));

  // 6. Groups where user is sole creator with no other members (delete the group)
  for (const { groupId } of coordinated) {
    const remaining = await db
      .select({ id: groupMemberships.id })
      .from(groupMemberships)
      .where(eq(groupMemberships.groupId, groupId));

    if (remaining.length === 0) {
      // Delete group's journal entries first (FK constraint)
      await db.delete(journalEntries).where(eq(journalEntries.groupId, groupId));
      // Delete activities in this group
      const groupActivities = await db
        .select({ id: activities.id })
        .from(activities)
        .where(eq(activities.groupId, groupId));
      for (const act of groupActivities) {
        await db.delete(peerAttestations).where(eq(peerAttestations.activityId, act.id));
        await db.delete(contributions).where(eq(contributions.activityId, act.id));
        await db.delete(attendances).where(eq(attendances.activityId, act.id));
      }
      await db.delete(activities).where(eq(activities.groupId, groupId));
      await db.delete(groups).where(eq(groups.id, groupId));
    }
  }

  // 7. Activities coordinated by user (set coordinator to null or delete if orphaned)
  // Activities have ON DELETE CASCADE for attendances/contributions via FK,
  // but coordinator_id references users — we need to handle these
  const userActivities = await db
    .select({ id: activities.id })
    .from(activities)
    .where(eq(activities.coordinatorId, userId));

  for (const act of userActivities) {
    await db.delete(peerAttestations).where(eq(peerAttestations.activityId, act.id));
    await db.delete(contributions).where(eq(contributions.activityId, act.id));
    await db.delete(attendances).where(eq(attendances.activityId, act.id));
    await db.delete(activities).where(eq(activities.id, act.id));
  }

  // 8. Auth records (sessions, accounts)
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(accounts).where(eq(accounts.userId, userId));

  // 9. User record
  await db.delete(users).where(eq(users.id, userId));

  return NextResponse.json({ ok: true, message: "All data deleted" });
}
