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

  // Check not already a member
  const existing = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, groupId),
      eq(groupMemberships.userId, invitee.id)
    ),
  });

  if (existing) {
    return NextResponse.json({ error: "Already a member" }, { status: 409 });
  }

  const [newMembership] = await db
    .insert(groupMemberships)
    .values({
      groupId,
      userId: invitee.id,
      role: "member",
    })
    .returning();

  return NextResponse.json(newMembership, { status: 201 });
}
