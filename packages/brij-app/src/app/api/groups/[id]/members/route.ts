import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { groupMemberships, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

/** POST /api/groups/:id/members — invite a member by email (coordinator only) */
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;

  // Verify coordinator
  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, groupId),
      eq(groupMemberships.userId, user.id),
      eq(groupMemberships.role, "coordinator")
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Must be coordinator" }, { status: 403 });
  }

  const body = await req.json();
  const { email } = body;

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  // Find user by email
  const invitee = await db.query.users.findFirst({
    where: eq(users.email, email.trim().toLowerCase()),
  });

  if (!invitee) {
    return NextResponse.json(
      { error: "User not found — they need to sign up first" },
      { status: 404 }
    );
  }

  // Check if already a member or pending
  const existing = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, groupId),
      eq(groupMemberships.userId, invitee.id)
    ),
  });

  if (existing) {
    // If pending, approve them
    if (existing.status === "pending") {
      const [updated] = await db
        .update(groupMemberships)
        .set({ status: "active" })
        .where(eq(groupMemberships.id, existing.id))
        .returning();
      return NextResponse.json(updated, { status: 200 });
    }
    return NextResponse.json({ error: "Already a member" }, { status: 409 });
  }

  const [newMembership] = await db
    .insert(groupMemberships)
    .values({
      groupId,
      userId: invitee.id,
      role: "member",
      status: "active",
    })
    .returning();

  return NextResponse.json(newMembership, { status: 201 });
}

/** PATCH /api/groups/:id/members — approve or ignore a pending member (coordinator only) */
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;

  // Verify coordinator
  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, groupId),
      eq(groupMemberships.userId, user.id),
      eq(groupMemberships.role, "coordinator")
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Must be coordinator" }, { status: 403 });
  }

  const body = await req.json();
  const { membershipId, action } = body;

  if (!membershipId || !action) {
    return NextResponse.json({ error: "membershipId and action required" }, { status: 400 });
  }

  const target = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.id, membershipId),
      eq(groupMemberships.groupId, groupId)
    ),
  });

  if (!target) {
    return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  }

  if (action === "approve") {
    const [updated] = await db
      .update(groupMemberships)
      .set({ status: "active" })
      .where(eq(groupMemberships.id, membershipId))
      .returning();
    return NextResponse.json(updated);
  }

  if (action === "ignore") {
    await db
      .delete(groupMemberships)
      .where(eq(groupMemberships.id, membershipId));
    return NextResponse.json({ ok: true });
  }

  if (action === "promote") {
    if (target.role === "coordinator") {
      return NextResponse.json({ error: "Already a coordinator" }, { status: 400 });
    }
    const [updated] = await db
      .update(groupMemberships)
      .set({ role: "coordinator" })
      .where(eq(groupMemberships.id, membershipId))
      .returning();
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "action must be 'approve', 'ignore', or 'promote'" }, { status: 400 });
}
