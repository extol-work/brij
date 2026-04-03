import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals, proposalOptions, votes, platformIdentities } from "@/db/schema";
import { authenticateBot } from "@/lib/bot-auth";
import { eq, and, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/bot/proposals/[id] — Proposal detail with participation count and results
 */
export async function GET(req: NextRequest, { params }: Params) {
  const auth = await authenticateBot(req, "read");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const proposal = await db.query.proposals.findFirst({
    where: and(
      eq(proposals.id, id),
      eq(proposals.groupId, auth.groupId),
    ),
  });

  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  // Get options with vote counts
  const options = await db
    .select({
      id: proposalOptions.id,
      label: proposalOptions.label,
      sortOrder: proposalOptions.sortOrder,
      voteCount: sql<number>`count(${votes.id})::int`,
    })
    .from(proposalOptions)
    .leftJoin(votes, eq(votes.optionId, proposalOptions.id))
    .where(eq(proposalOptions.proposalId, id))
    .groupBy(proposalOptions.id, proposalOptions.label, proposalOptions.sortOrder)
    .orderBy(proposalOptions.sortOrder);

  const totalVotes = options.reduce((sum, o) => sum + o.voteCount, 0);
  const quorumMet = proposal.quorum
    ? totalVotes / auth.group.memberCount >= parseFloat(proposal.quorum)
    : true;

  // For active formal proposals, hide per-option vote counts (secret ballot)
  const isSecretAndActive = proposal.mode === "formal" && proposal.status === "active";

  const response: Record<string, unknown> = {
    id: proposal.id,
    title: proposal.title,
    context: proposal.context,
    type: proposal.type,
    mode: proposal.mode,
    status: proposal.status,
    closes_at: proposal.closesAt.toISOString(),
    decided_at: proposal.decidedAt?.toISOString() ?? null,
    votes_cast: totalVotes,
    member_count: auth.group.memberCount,
    quorum: proposal.quorum ? parseFloat(proposal.quorum) : null,
    quorum_met: quorumMet,
    result: proposal.result,
    options: options.map((o) => ({
      id: o.id,
      label: o.label,
      ...(isSecretAndActive ? {} : { votes: o.voteCount }),
    })),
  };

  // Include reasoning if proposal is decided (public reasoning only)
  if (proposal.status !== "active") {
    const allVotes = await db
      .select({
        optionLabel: proposalOptions.label,
        reasoning: votes.reasoning,
        platformUsername: platformIdentities.platformUsername,
      })
      .from(votes)
      .innerJoin(proposalOptions, eq(proposalOptions.id, votes.optionId))
      .leftJoin(platformIdentities, eq(platformIdentities.id, votes.platformIdentityId))
      .where(and(eq(votes.proposalId, id), sql`${votes.reasoning} IS NOT NULL`));

    if (allVotes.length > 0) {
      response.reasoning = allVotes.map((v) => ({
        voter: v.platformUsername ?? "Anonymous",
        option: v.optionLabel,
        text: v.reasoning,
      }));
    }
  }

  return NextResponse.json(response);
}
