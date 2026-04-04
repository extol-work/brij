import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  proposals,
  proposalOptions,
  votes,
  platformIdentities,
  groupMemberships,
} from "@/db/schema";
import { authenticateBot } from "@/lib/bot-auth";
import { eq, and, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/bot/proposals/[id]/vote — Cast or change a vote
 */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await authenticateBot(req, "write");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await req.json();
  const { platform_user_id, option_id, reasoning } = body;

  if (!option_id || typeof option_id !== "string") {
    return NextResponse.json({ error: "option_id is required" }, { status: 400 });
  }

  if (!platform_user_id || typeof platform_user_id !== "string") {
    return NextResponse.json({ error: "platform_user_id is required" }, { status: 400 });
  }

  // Verify proposal exists and belongs to this group
  const proposal = await db.query.proposals.findFirst({
    where: and(
      eq(proposals.id, id),
      eq(proposals.groupId, auth.groupId),
    ),
  });

  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  if (proposal.status !== "active") {
    return NextResponse.json({ error: "Proposal is no longer active" }, { status: 400 });
  }

  if (new Date() > proposal.closesAt) {
    return NextResponse.json({ error: "Voting period has ended" }, { status: 400 });
  }

  // Verify option belongs to this proposal
  const option = await db.query.proposalOptions.findFirst({
    where: and(
      eq(proposalOptions.id, option_id),
      eq(proposalOptions.proposalId, id),
    ),
  });

  if (!option) {
    return NextResponse.json({ error: "Invalid option_id for this proposal" }, { status: 400 });
  }

  // Resolve voter identity
  const colonIdx = platform_user_id.indexOf(":");
  if (colonIdx === -1) {
    return NextResponse.json({ error: "platform_user_id must be in format 'platform:id'" }, { status: 400 });
  }
  const platform = platform_user_id.slice(0, colonIdx);
  const platformId = platform_user_id.slice(colonIdx + 1);

  // Find or create platform identity
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

  // Check for existing vote by this platform identity OR by the linked Extol user.
  // If a Discord user is linked to an Extol account that already voted via web,
  // they're the same person — update rather than duplicate.
  let existingVote = await db.query.votes.findFirst({
    where: and(
      eq(votes.proposalId, id),
      eq(votes.platformIdentityId, identity.id),
    ),
  });

  // Also check if the linked Extol user already voted (via web or another platform)
  if (!existingVote && identity.userId) {
    existingVote = await db.query.votes.findFirst({
      where: and(
        eq(votes.proposalId, id),
        eq(votes.userId, identity.userId),
      ),
    });
  }

  let voteId: string;
  let changed = false;

  if (existingVote) {
    // Update existing vote (same person, different interface)
    const [updated] = await db
      .update(votes)
      .set({
        optionId: option_id,
        platformIdentityId: identity.id, // track which interface was used last
        reasoning: reasoning || existingVote.reasoning,
        changedAt: new Date(),
      })
      .where(eq(votes.id, existingVote.id))
      .returning();
    voteId = updated.id;
    changed = true;
  } else {
    // Cast new vote
    const [newVote] = await db
      .insert(votes)
      .values({
        proposalId: id,
        optionId: option_id,
        userId: identity.userId || null,
        platformIdentityId: identity.id,
        reasoning: reasoning || null,
      })
      .returning();
    voteId = newVote.id;
  }

  // Count total votes
  const [voteCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(votes)
    .where(eq(votes.proposalId, id));

  const totalVotes = voteCount?.count ?? 0;
  const votesRequired = proposal.quorum
    ? Math.ceil(auth.group.memberCount * parseFloat(proposal.quorum))
    : null;

  // Early close: if all members have voted
  if (totalVotes >= auth.group.memberCount && auth.group.memberCount > 0) {
    await resolveProposal(id);
  }

  return NextResponse.json({
    vote_id: voteId,
    recorded: true,
    changed,
    proposal_status: "active",
    votes_cast: totalVotes,
    votes_required: votesRequired,
  });
}

/**
 * Resolve a proposal: compute result, update status.
 * Called on early close (all members voted) and by the auto-close cron.
 */
async function resolveProposal(proposalId: string) {
  const proposal = await db.query.proposals.findFirst({
    where: eq(proposals.id, proposalId),
  });
  if (!proposal || proposal.status !== "active") return;

  // Get options with vote counts
  const options = await db
    .select({
      id: proposalOptions.id,
      label: proposalOptions.label,
      voteCount: sql<number>`count(${votes.id})::int`,
    })
    .from(proposalOptions)
    .leftJoin(votes, eq(votes.optionId, proposalOptions.id))
    .where(eq(proposalOptions.proposalId, proposalId))
    .groupBy(proposalOptions.id, proposalOptions.label);

  const totalVotes = options.reduce((sum, o) => sum + o.voteCount, 0);

  // Check quorum
  // We need member count — get it from group memberships
  const [memberCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.groupId, proposal.groupId),
        eq(groupMemberships.status, "active"),
      )
    );

  const members = memberCount?.count ?? 0;

  if (proposal.quorum && members > 0) {
    const quorumThreshold = parseFloat(proposal.quorum);
    if (totalVotes / members < quorumThreshold) {
      await db
        .update(proposals)
        .set({ status: "inconclusive", decidedAt: new Date() })
        .where(eq(proposals.id, proposalId));
      return;
    }
  }

  // Find winner
  const sorted = [...options].sort((a, b) => b.voteCount - a.voteCount);
  const top = sorted[0];
  const runnerUp = sorted[1];

  if (top && runnerUp && top.voteCount === runnerUp.voteCount) {
    await db
      .update(proposals)
      .set({ status: "tied", decidedAt: new Date() })
      .where(eq(proposals.id, proposalId));
    return;
  }

  await db
    .update(proposals)
    .set({
      status: "decided",
      result: top?.label ?? null,
      decidedAt: new Date(),
    })
    .where(eq(proposals.id, proposalId));
}

// Export for use by cron
export { resolveProposal };
