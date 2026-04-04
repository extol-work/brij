import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  contributions,
  contributionMembers,
  attestationEdges,
  groupMemberships,
} from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { eq, and, sql } from "drizzle-orm";
import { pushPeerAttestation } from "@/lib/cortex";
import { createHash } from "crypto";

const DAILY_CONFIRM_LIMIT = 5; // per group, per Nereid's design

/**
 * POST /api/contributions/[id]/confirm — confirm a contribution as a peer witness
 *
 * Creates attestation_type=1 (peer-witness) edge.
 * Rate limited to 5 confirmations per day per group.
 * Cannot confirm your own contributions.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: contributionId } = await params;

  // Fetch contribution
  const contribution = await db.query.contributions.findFirst({
    where: eq(contributions.id, contributionId),
  });

  if (!contribution) {
    return NextResponse.json(
      { error: "Contribution not found" },
      { status: 404 }
    );
  }

  // Cannot confirm your own contribution
  if (contribution.createdBy === user.id) {
    return NextResponse.json(
      { error: "Cannot confirm your own contribution" },
      { status: 400 }
    );
  }

  // Personal contributions (no group) cannot be confirmed
  if (!contribution.groupId) {
    return NextResponse.json(
      { error: "Personal contributions cannot be confirmed" },
      { status: 400 }
    );
  }

  // Must be a member of the same group
  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, contribution.groupId),
      eq(groupMemberships.userId, user.id),
      eq(groupMemberships.status, "active")
    ),
  });

  if (!membership) {
    return NextResponse.json(
      { error: "You must be a member of this group" },
      { status: 403 }
    );
  }

  // Rate limit: 5 confirmations per day per group
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [dailyCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(attestationEdges)
    .where(
      and(
        eq(attestationEdges.attestorId, user.id),
        eq(attestationEdges.groupId, contribution.groupId),
        eq(attestationEdges.edgeType, "contribution_confirmation"),
        sql`${attestationEdges.createdAt} >= ${today.toISOString()}`
      )
    );

  if (Number(dailyCount.count) >= DAILY_CONFIRM_LIMIT) {
    return NextResponse.json(
      { error: `Daily confirmation limit reached (${DAILY_CONFIRM_LIMIT} per group)` },
      { status: 429 }
    );
  }

  // Check if already confirmed (idempotent)
  const existingEdge = await db.query.attestationEdges.findFirst({
    where: and(
      eq(attestationEdges.attestorId, user.id),
      eq(attestationEdges.subjectId, contribution.createdBy),
      eq(attestationEdges.edgeType, "contribution_confirmation"),
      eq(attestationEdges.sourceId, contributionId)
    ),
  });

  if (existingEdge) {
    return NextResponse.json({ ok: true, alreadyConfirmed: true });
  }

  const now = new Date();

  // Check if the confirmer is a tagged collaborator
  const existingMember = await db.query.contributionMembers.findFirst({
    where: and(
      eq(contributionMembers.contributionId, contributionId),
      eq(contributionMembers.userId, user.id)
    ),
  });

  if (existingMember) {
    // Tagged collaborator — mark as confirmed
    await db
      .update(contributionMembers)
      .set({ confirmed: true, confirmedAt: now })
      .where(eq(contributionMembers.id, existingMember.id));
  } else {
    // Untagged group member vouching — add as confirmed member
    await db.insert(contributionMembers).values({
      contributionId,
      userId: user.id,
      confirmed: true,
      confirmedAt: now,
    });
  }

  // Create attestation edge
  await db.insert(attestationEdges).values({
    groupId: contribution.groupId!,
    attestorId: user.id,
    subjectId: contribution.createdBy,
    edgeType: "contribution_confirmation",
    sourceId: contributionId,
  });

  // Push to Cortex (fire-and-forget)
  const attestorDerivationInput = createHash("sha256")
    .update(`extol:${user.id}`)
    .digest("hex");
  const subjectDerivationInput = createHash("sha256")
    .update(`extol:${contribution.createdBy}`)
    .digest("hex");

  pushPeerAttestation(
    contribution.groupId!,
    attestorDerivationInput,
    subjectDerivationInput,
    contributionId,
    contribution.description,
    now.toISOString()
  );

  return NextResponse.json({ ok: true, alreadyConfirmed: false });
}
