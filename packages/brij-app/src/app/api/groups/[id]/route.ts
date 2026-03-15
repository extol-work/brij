import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { groups, groupMemberships, users, journalEntries } from "@/db/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

/** GET /api/groups/:id — group detail with members and entry count */
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify membership
  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, id),
      eq(groupMemberships.userId, user.id)
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const group = await db.query.groups.findFirst({
    where: eq(groups.id, id),
  });

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const members = await db
    .select({
      id: groupMemberships.id,
      userId: groupMemberships.userId,
      role: groupMemberships.role,
      joinedAt: groupMemberships.joinedAt,
      name: users.name,
      email: users.email,
    })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .where(eq(groupMemberships.groupId, id));

  // Count non-deleted entries
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(journalEntries)
    .where(
      and(
        eq(journalEntries.groupId, id),
        isNull(journalEntries.deletedAt)
      )
    );

  // Update last_seen_at for unread tracking
  await db
    .update(groupMemberships)
    .set({ lastSeenAt: new Date() })
    .where(
      and(
        eq(groupMemberships.groupId, id),
        eq(groupMemberships.userId, user.id)
      )
    );

  return NextResponse.json({
    ...group,
    members,
    entryCount: count,
    currentMembership: membership,
  });
}

/** PATCH /api/groups/:id — edit group name/description (coordinator only) */
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, id),
      eq(groupMemberships.userId, user.id),
      eq(groupMemberships.role, "coordinator")
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Must be coordinator" }, { status: 403 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    updates.name = body.name.trim();
  }
  if (body.description !== undefined) {
    updates.description = body.description?.trim() || null;
  }
  if (body.color !== undefined) {
    updates.color = body.color;
  }
  if (body.membershipMode !== undefined) {
    updates.membershipMode = body.membershipMode;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(groups)
    .set(updates)
    .where(eq(groups.id, id))
    .returning();

  return NextResponse.json(updated);
}

/** DELETE /api/groups/:id — leave the group (non-coordinators only) */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, id),
      eq(groupMemberships.userId, user.id)
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 404 });
  }

  if (membership.role === "coordinator") {
    return NextResponse.json({ error: "Coordinators cannot leave yet — transfer ownership first" }, { status: 400 });
  }

  await db
    .delete(groupMemberships)
    .where(
      and(
        eq(groupMemberships.groupId, id),
        eq(groupMemberships.userId, user.id)
      )
    );

  return NextResponse.json({ ok: true });
}
