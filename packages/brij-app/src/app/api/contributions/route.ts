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
import { eq, and, desc } from "drizzle-orm";

const MAX_DESCRIPTION = 2000;
const MAX_EVIDENCE_URL = 2000;
const MAX_COLLABORATORS = 20;

/**
 * POST /api/contributions — create a contribution record with optional collaborators
 *
 * Body: { groupId, description, evidenceUrl?, collaboratorIds?: string[] }
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

  if (!groupId || !description) {
    return NextResponse.json(
      { error: "groupId and description are required" },
      { status: 400 }
    );
  }

  const desc_trimmed = String(description).trim();
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

  // Verify user is an active member of the group
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

  // Validate collaborators are active members of the same group (exclude self)
  let validCollaboratorIds: string[] = [];
  if (Array.isArray(collaboratorIds) && collaboratorIds.length > 0) {
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

  // Create contribution
  const [contribution] = await db
    .insert(contributions)
    .values({
      groupId,
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
    description: contribution.description,
    evidenceUrl: contribution.evidenceUrl,
    createdBy: contribution.createdBy,
    collaborators: validCollaboratorIds.length,
    createdAt: contribution.createdAt,
  }, { status: 201 });
}

/**
 * GET /api/contributions?groupId=xxx — list contributions for a group
 */
export async function GET(req: NextRequest) {
  const limited = await checkRateLimit(req, "auth");
  if (limited) return limited;

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groupId = req.nextUrl.searchParams.get("groupId");
  if (!groupId) {
    return NextResponse.json(
      { error: "groupId is required" },
      { status: 400 }
    );
  }

  // Verify membership
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

  // Fetch contributions with creator info
  const rows = await db
    .select({
      id: contributions.id,
      description: contributions.description,
      evidenceUrl: contributions.evidenceUrl,
      createdBy: contributions.createdBy,
      creatorName: users.name,
      attestationStatus: contributions.attestationStatus,
      createdAt: contributions.createdAt,
    })
    .from(contributions)
    .innerJoin(users, eq(users.id, contributions.createdBy))
    .where(eq(contributions.groupId, groupId))
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
