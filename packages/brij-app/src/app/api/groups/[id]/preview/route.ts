import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { groups, groupMemberships } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

/** GET /api/groups/:id/preview — public group info for non-members */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const group = await db.query.groups.findFirst({
    where: eq(groups.id, id),
  });

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.groupId, id),
        eq(groupMemberships.status, "active")
      )
    );

  // Check if authenticated user has a pending request
  const user = await getAuthUser().catch(() => null);
  let membershipStatus: string | null = null;
  if (user) {
    const existing = await db.query.groupMemberships.findFirst({
      where: and(
        eq(groupMemberships.groupId, id),
        eq(groupMemberships.userId, user.id)
      ),
    });
    membershipStatus = existing?.status ?? null;
  }

  return NextResponse.json({
    id: group.id,
    name: group.name,
    description: group.description,
    color: group.color,
    membershipMode: group.membershipMode,
    joinCode: group.joinCode,
    memberCount: count,
    membershipStatus,
  });
}
