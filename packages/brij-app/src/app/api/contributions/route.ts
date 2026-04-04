import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  contributions,
  contributionMembers,
  groupMemberships,
  users,
} from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { eq, and, desc, isNull, inArray } from "drizzle-orm";
import { attestationEdges } from "@/db/schema";

const MAX_DESCRIPTION = 2000;
const MAX_EVIDENCE_URL = 2000;
const MAX_COLLABORATORS = 20;

type ContributionType = "collaborative" | "published_work" | "solo_self_report";

function deriveContributionType(
  hasCollaborators: boolean,
  hasEvidence: boolean
): ContributionType {
  if (hasCollaborators) return "collaborative";
  if (hasEvidence) return "published_work";
  return "solo_self_report";
}

/**
 * POST /api/contributions — create a contribution record with optional collaborators
 *
 * Body: { groupId?, description, evidenceUrl?, collaboratorIds?: string[] }
 *
 * groupId is optional — null means personal contribution (shows on /me only).
 * Collaborative contributions require a groupId (need shared membership to tag collaborators).
 */
export async function POST(req: NextRequest) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { groupId, description, evidenceUrl, collaboratorIds } = body;

  const desc_trimmed = String(description ?? "").trim();
  if (desc_trimmed.length === 0 || desc_trimmed.length > MAX_DESCRIPTION) {
    return NextResponse.json(
      { error: `Description must be 1-${MAX_DESCRIPTION} characters` },
      { status: 400 }
    );
  }

  if (evidenceUrl && String(evidenceUrl).length > MAX_EVIDENCE_URL) {
    return NextResponse.json(
      { error: `Evidence URL must be ${MAX_EVIDENCE_URL} characters or less` },
      { status: 400 }
    );
  }

  const hasCollaborators = Array.isArray(collaboratorIds) && collaboratorIds.length > 0;

  // Collaborative contributions require a group (need shared membership)
  if (hasCollaborators && !groupId) {
    return NextResponse.json(
      { error: "Collaborative contributions require a group" },
      { status: 400 }
    );
  }

  // If group-scoped, verify membership
  if (groupId) {
    const membership = await db.query.groupMemberships.findFirst({
      where: and(
        eq(groupMemberships.groupId, groupId),
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
  }

  // Validate collaborators are active members of the same group (exclude self)
  let validCollaboratorIds: string[] = [];
  if (hasCollaborators) {
    if (collaboratorIds.length > MAX_COLLABORATORS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_COLLABORATORS} collaborators` },
        { status: 400 }
      );
    }

    const uniqueIds = [...new Set(collaboratorIds.filter((id: string) => id !== user.id))];

    for (const collabId of uniqueIds) {
      const collabMembership = await db.query.groupMemberships.findFirst({
        where: and(
          eq(groupMemberships.groupId, groupId),
          eq(groupMemberships.userId, collabId),
          eq(groupMemberships.status, "active")
        ),
      });
      if (collabMembership) {
        validCollaboratorIds.push(collabId);
      }
    }
  }

  const contributionType = deriveContributionType(
    validCollaboratorIds.length > 0,
    !!evidenceUrl
  );

  // Create contribution
  const [contribution] = await db
    .insert(contributions)
    .values({
      groupId: groupId || null,
      contributionType,
      description: desc_trimmed,
      evidenceUrl: evidenceUrl ? String(evidenceUrl).trim() : null,
      createdBy: user.id,
    })
    .returning();

  // Add collaborator members (unconfirmed)
  if (validCollaboratorIds.length > 0) {
    await db.insert(contributionMembers).values(
      validCollaboratorIds.map((userId) => ({
        contributionId: contribution.id,
        userId,
      }))
    );
  }

  return NextResponse.json({
    id: contribution.id,
    groupId: contribution.groupId,
    contributionType: contribution.contributionType,
    description: contribution.description,
    evidenceUrl: contribution.evidenceUrl,
    createdBy: contribution.createdBy,
    collaborators: validCollaboratorIds.length,
    createdAt: contribution.createdAt,
  }, { status: 201 });
}

/**
 * GET /api/contributions?groupId=xxx — list contributions for a group
 * GET /api/contributions?personal=true — list personal contributions for authenticated user
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groupId = req.nextUrl.searchParams.get("groupId");
  const personal = req.nextUrl.searchParams.get("personal");

  if (!groupId && !personal) {
    return NextResponse.json(
      { error: "groupId or personal=true is required" },
      { status: 400 }
    );
  }

  // Personal contributions: groupId IS NULL, created by this user
  if (personal === "true") {
    const rows = await db
      .select({
        id: contributions.id,
        contributionType: contributions.contributionType,
        description: contributions.description,
        evidenceUrl: contributions.evidenceUrl,
        createdBy: contributions.createdBy,
        creatorName: users.name,
        attestationStatus: contributions.attestationStatus,
        createdAt: contributions.createdAt,
      })
      .from(contributions)
      .innerJoin(users, eq(users.id, contributions.createdBy))
      .where(
        and(
          isNull(contributions.groupId),
          eq(contributions.createdBy, user.id)
        )
      )
      .orderBy(desc(contributions.createdAt))
      .limit(100);

    return NextResponse.json(rows);
  }

  // Group-scoped: verify membership
  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, groupId!),
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

  // Fetch contributions with creator info
  const rows = await db
    .select({
      id: contributions.id,
      contributionType: contributions.contributionType,
      description: contributions.description,
      evidenceUrl: contributions.evidenceUrl,
      createdBy: contributions.createdBy,
      creatorName: users.name,
      attestationStatus: contributions.attestationStatus,
      createdAt: contributions.createdAt,
    })
    .from(contributions)
    .innerJoin(users, eq(users.id, contributions.createdBy))
    .where(eq(contributions.groupId, groupId!))
    .orderBy(desc(contributions.createdAt))
    .limit(100);

  // Fetch collaborator counts and confirmation status
  const result = await Promise.all(
    rows.map(async (row) => {
      const members = await db
        .select({
          userId: contributionMembers.userId,
          confirmed: contributionMembers.confirmed,
          userName: users.name,
        })
        .from(contributionMembers)
        .innerJoin(users, eq(users.id, contributionMembers.userId))
        .where(eq(contributionMembers.contributionId, row.id));

      return {
        ...row,
        collaborators: members.map((m) => ({
          userId: m.userId,
          name: m.userName,
          confirmed: m.confirmed,
        })),
        confirmedCount: members.filter((m) => m.confirmed).length,
      };
    })
  );

  return NextResponse.json(result);
}

/**
 * DELETE /api/contributions — delete a contribution (author only)
 *
 * Body: { contributionId: string }
 */
export async function DELETE(req: NextRequest) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { contributionId } = body;

  if (!contributionId) {
    return NextResponse.json({ error: "contributionId required" }, { status: 400 });
  }

  const contribution = await db.query.contributions.findFirst({
    where: eq(contributions.id, contributionId),
  });

  if (!contribution) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (contribution.createdBy !== user.id) {
    return NextResponse.json({ error: "Only the author can delete" }, { status: 403 });
  }

  // Delete related records then contribution
  await db.delete(attestationEdges).where(eq(attestationEdges.sourceId, contributionId));
  await db.delete(contributionMembers).where(eq(contributionMembers.contributionId, contributionId));
  await db.delete(contributions).where(eq(contributions.id, contributionId));

  return NextResponse.json({ deleted: true });
}
