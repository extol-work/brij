import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { proposals, proposalOptions, platformIdentities, votes } from "@/db/schema";
import { authenticateBot } from "@/lib/bot-auth";
import { validateText, truncate, limits } from "@/lib/validate";
import { eq, and, sql, isNotNull } from "drizzle-orm";

/**
 * POST /api/bot/proposals — Create a quick vote or formal proposal
 * GET  /api/bot/proposals — List proposals for the group
 */

export async function POST(req: NextRequest) {
  const auth = await authenticateBot(req, "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const {
    title,
    context,
    type,
    mode = "formal",
    options,
    voting_period_hours,
    quorum,
    platform_user_id,
  } = body;

  // Validate title
  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const titleErr = validateText(title, "Title", limits.MAX_TITLE);
  if (titleErr) return NextResponse.json({ error: titleErr }, { status: 400 });

  // Validate type
  if (type !== "yes_no" && type !== "multiple_choice") {
    return NextResponse.json({ error: "type must be 'yes_no' or 'multiple_choice'" }, { status: 400 });
  }

  // Validate mode
  if (mode !== "quick" && mode !== "formal") {
    return NextResponse.json({ error: "mode must be 'quick' or 'formal'" }, { status: 400 });
  }

  // Validate options
  const optionLabels: string[] =
    type === "yes_no" ? (options || ["Yes", "No"]) : options;
  if (!Array.isArray(optionLabels) || optionLabels.length < 2 || optionLabels.length > 6) {
    return NextResponse.json({ error: "options must be an array of 2-6 strings" }, { status: 400 });
  }
  if (optionLabels.some((o: unknown) => typeof o !== "string" || !o.trim())) {
    return NextResponse.json({ error: "Each option must be a non-empty string" }, { status: 400 });
  }

  // Tier check: active proposals limit
  if (auth.limits.activeProposals !== -1) {
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(proposals)
      .where(
        and(
          eq(proposals.groupId, auth.groupId),
          eq(proposals.status, "active"),
        )
      );
    if ((countRow?.count ?? 0) >= auth.limits.activeProposals) {
      return NextResponse.json(
        { error: `Active proposal limit reached (${auth.limits.activeProposals} for ${auth.tier} tier)` },
        { status: 400 }
      );
    }
  }

  // Resolve creator identity
  let createdBy: string | null = null;
  let createdByPlatformIdentityId: string | null = null;

  if (platform_user_id && typeof platform_user_id === "string") {
    const colonIdx = platform_user_id.indexOf(":");
    if (colonIdx !== -1) {
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

      createdByPlatformIdentityId = identity.id;
      // If the platform identity is linked to a user, also set created_by
      if (identity.userId) {
        createdBy = identity.userId;
      }
    }
  }

  // Fall back to the key creator if no platform identity
  if (!createdBy && !createdByPlatformIdentityId) {
    createdBy = auth.createdById;
  }

  // Compute defaults based on mode
  const defaultHours = mode === "quick" ? 24 : 120;
  const hours = voting_period_hours ?? defaultHours;
  const defaultQuorum = mode === "quick" ? null : 0.51;
  const resolvedQuorum = quorum !== undefined ? (quorum === null ? null : String(quorum)) : (defaultQuorum !== null ? String(defaultQuorum) : null);

  const now = new Date();
  const closesAt = new Date(now.getTime() + hours * 60 * 60 * 1000);

  // Create proposal + options in a transaction
  const result = await db.transaction(async (tx) => {
    const [proposal] = await tx
      .insert(proposals)
      .values({
        groupId: auth.groupId,
        createdBy,
        createdByPlatformIdentityId,
        title: truncate(title, limits.MAX_TITLE),
        context: context ? truncate(context, limits.MAX_DESCRIPTION) : null,
        type,
        mode,
        votingPeriodHours: hours,
        quorum: resolvedQuorum,
        closesAt,
      })
      .returning();

    const opts = await tx
      .insert(proposalOptions)
      .values(
        optionLabels.map((label: string, i: number) => ({
          proposalId: proposal.id,
          label: label.trim(),
          sortOrder: i,
        }))
      )
      .returning();

    return { proposal, options: opts };
  });

  return NextResponse.json(
    {
      id: result.proposal.id,
      title: result.proposal.title,
      type: result.proposal.type,
      mode: result.proposal.mode,
      status: result.proposal.status,
      closes_at: result.proposal.closesAt.toISOString(),
      options: result.options.map((o) => ({ id: o.id, label: o.label })),
    },
    { status: 201 }
  );
}

export async function GET(req: NextRequest) {
  const auth = await authenticateBot(req, "read");
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "active";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);

  const whereClause =
    status === "all"
      ? eq(proposals.groupId, auth.groupId)
      : and(eq(proposals.groupId, auth.groupId), eq(proposals.status, status as "active" | "decided" | "tied" | "inconclusive"));

  const results = await db.query.proposals.findMany({
    where: whereClause,
    limit,
    orderBy: (p, { desc }) => [desc(p.createdAt)],
  });

  // Get vote counts for each proposal
  const proposalList = await Promise.all(
    results.map(async (p) => {
      const [voteCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(votes)
        .where(and(eq(votes.proposalId, p.id), isNotNull(votes.userId)));

      return {
        id: p.id,
        title: p.title,
        type: p.type,
        mode: p.mode,
        status: p.status,
        closes_at: p.closesAt.toISOString(),
        votes_cast: voteCount?.count ?? 0,
        member_count: auth.group.memberCount,
      };
    })
  );

  return NextResponse.json({ proposals: proposalList });
}
