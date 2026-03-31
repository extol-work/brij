import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { groups, groupMemberships } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/** GET /api/groups/join?code=xxx — preview a group (no auth required for info) */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

  const group = await db.query.groups.findFirst({
    where: eq(groups.joinCode, code.trim()),
  });

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: group.id,
    name: group.name,
    description: group.description,
    color: group.color,
    membershipMode: group.membershipMode,
  });
}

/** POST /api/groups/join — join a group by code */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { code } = body;

  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const group = await db.query.groups.findFirst({
    where: eq(groups.joinCode, code.trim()),
  });

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // Check if already a member or has a pending invite
  const existing = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, group.id),
      eq(groupMemberships.userId, user.id)
    ),
  });

  if (existing) {
    // If pending and coordinator-invited, auto-activate (they accepted the invite)
    if (existing.status === "pending" && existing.invitedBy) {
      await db
        .update(groupMemberships)
        .set({ status: "active", joinedAt: new Date() })
        .where(eq(groupMemberships.id, existing.id));
      return NextResponse.json({ groupId: group.id, name: group.name, accepted: true }, { status: 200 });
    }
    return NextResponse.json({ error: "Already a member", groupId: group.id }, { status: 409 });
  }

  // Invite-only groups: create pending membership on explicit request
  if (group.membershipMode === "invite_only") {
    // Check if requesting admission (explicit action)
    const { requestAdmission } = body;
    if (requestAdmission) {
      await db.insert(groupMemberships).values({
        groupId: group.id,
        userId: user.id,
        role: "member",
        status: "pending",
      });
      return NextResponse.json({
        status: "pending",
        groupId: group.id,
        name: group.name,
        message: "Your request has been sent to the coordinator.",
      }, { status: 201 });
    }

    return NextResponse.json({
      error: "invite_only",
      groupId: group.id,
      name: group.name,
    }, { status: 403 });
  }

  await db.insert(groupMemberships).values({
    groupId: group.id,
    userId: user.id,
    role: "member",
    status: "active",
  });

  return NextResponse.json({ groupId: group.id, name: group.name }, { status: 201 });
}
