import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { groups, groupMemberships, communityPlans } from "@/db/schema";
import type { CommunityTier } from "@/lib/community-plan";
import { eq, desc, and, isNull, inArray } from "drizzle-orm";
import { pushGroupCreated } from "@/lib/cortex";
import { isPaidTier } from "@/lib/community-plan";

/** GET /api/groups — list groups the user belongs to */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      description: groups.description,
      color: groups.color,
      role: groupMemberships.role,
      lastSeenAt: groupMemberships.lastSeenAt,
      joinedAt: groupMemberships.joinedAt,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(and(eq(groupMemberships.userId, user.id), eq(groupMemberships.status, "active"), isNull(groups.deletedAt)))
    .orderBy(desc(groupMemberships.joinedAt));

  return NextResponse.json(rows);
}

/** POST /api/groups — create a group (creator becomes coordinator) */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, description, color, type, membershipMode } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Check group creation limit — free tier = 3, paid = unlimited
  const userGroups = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.createdById, user.id), isNull(groups.deletedAt)));

  if (userGroups.length >= 3) {
    // Only enforce if ALL existing groups are free tier
    const groupIds = userGroups.map((g) => g.id);
    const plans = await db
      .select({ tier: communityPlans.tier })
      .from(communityPlans)
      .where(inArray(communityPlans.groupId, groupIds));

    const hasPaid = plans.some((p) => isPaidTier(p.tier));
    if (!hasPaid) {
      return NextResponse.json(
        { error: "Free accounts can create up to 3 groups. Upgrade a group to create more." },
        { status: 403 }
      );
    }
  }

  const result = await db.transaction(async (tx) => {
    const joinCode = Math.random().toString(36).slice(2, 8);
    const [group] = await tx
      .insert(groups)
      .values({
        name: name.trim(),
        description: description?.trim() || null,
        type: type || "other",
        color: color || "#7c3aed",
        joinCode,
        membershipMode: membershipMode || "invite_only",
        createdById: user.id,
      })
      .returning();

    await tx.insert(groupMemberships).values({
      groupId: group.id,
      userId: user.id,
      role: "coordinator",
    });

    // Every group gets a plan row — defaults to free
    await tx.insert(communityPlans).values({
      groupId: group.id,
      tier: "free" as CommunityTier,
    });

    return group;
  });

  pushGroupCreated(result.id, user.id, result.name, result.createdAt.toISOString());

  return NextResponse.json(result, { status: 201 });
}
