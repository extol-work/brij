import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { groups, groupMemberships } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";

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
    .where(and(eq(groupMemberships.userId, user.id), eq(groupMemberships.status, "active")))
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

    return group;
  });

  return NextResponse.json(result, { status: 201 });
}
