import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { verifyLinkToken } from "@/lib/link-token";
import { db } from "@/db";
import { platformIdentities, attendances, votes } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";

/**
 * POST /api/link/claim
 *
 * Authenticated user claims a platform identity via a signed token.
 * Links ALL platform_identities for this (platform, platformUserId) across all groups.
 * Backfills userId on attendance and vote records.
 *
 * Body: { token: "xxx" }
 * Response: { linked: number, attendances_claimed: number, votes_claimed: number }
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { token } = body;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const payload = await verifyLinkToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: "Invalid or expired link token" },
      { status: 400 }
    );
  }

  // Find all platform identities for this (platform, platformUserId) across all groups
  const identities = await db.query.platformIdentities.findMany({
    where: and(
      eq(platformIdentities.platform, payload.platform),
      eq(platformIdentities.platformUserId, payload.platformUserId),
    ),
  });

  if (identities.length === 0) {
    return NextResponse.json(
      { error: "No platform identity found. Check in to an event first, then try linking." },
      { status: 404 }
    );
  }

  // Check if any are already linked to a DIFFERENT user
  const linkedToOther = identities.find(
    (pi) => pi.userId && pi.userId !== user.id
  );
  if (linkedToOther) {
    return NextResponse.json(
      { error: "This platform account is already linked to another user" },
      { status: 409 }
    );
  }

  const now = new Date();
  let linked = 0;
  let attendancesClaimed = 0;
  let votesClaimed = 0;

  for (const pi of identities) {
    // Link the platform identity to this user (skip if already linked to same user)
    if (!pi.userId) {
      await db
        .update(platformIdentities)
        .set({
          userId: user.id,
          linkedAt: now,
          unclaimedAttendanceCount: 0,
        })
        .where(eq(platformIdentities.id, pi.id));
      linked++;
    }

    // Backfill attendances: set userId where it's NULL for this platform identity
    const attendanceResult = await db
      .update(attendances)
      .set({ userId: user.id, guestName: null })
      .where(
        and(
          eq(attendances.platformIdentityId, pi.id),
          isNull(attendances.userId)
        )
      )
      .returning({ id: attendances.id });
    attendancesClaimed += attendanceResult.length;

    // Backfill votes: set userId where it's NULL for this platform identity
    // But skip if the user already voted on that proposal (unique constraint)
    const unclaimedVotes = await db.query.votes.findMany({
      where: and(
        eq(votes.platformIdentityId, pi.id),
        isNull(votes.userId),
      ),
    });

    for (const vote of unclaimedVotes) {
      // Check if user already has a vote on this proposal
      const existingUserVote = await db.query.votes.findFirst({
        where: and(
          eq(votes.proposalId, vote.proposalId),
          eq(votes.userId, user.id),
        ),
      });

      if (existingUserVote) {
        // User already voted via web — keep web vote, leave platform vote as-is
        continue;
      }

      await db
        .update(votes)
        .set({ userId: user.id })
        .where(eq(votes.id, vote.id));
      votesClaimed++;
    }
  }

  return NextResponse.json({
    linked,
    attendances_claimed: attendancesClaimed,
    votes_claimed: votesClaimed,
    platform: payload.platform,
    platform_username: payload.platformUsername,
  });
}
