import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { groupMemberships, groups, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { Resend } from "resend";

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

  const trimmedEmail = email.trim().toLowerCase();

  // Get group info for email + join link
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
  });

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // Find user by email
  const invitee = await db.query.users.findFirst({
    where: eq(users.email, trimmedEmail),
  });

  if (invitee) {
    // Check if already a member or pending
    const existing = await db.query.groupMemberships.findFirst({
      where: and(
        eq(groupMemberships.groupId, groupId),
        eq(groupMemberships.userId, invitee.id)
      ),
    });

    if (existing) {
      if (existing.status === "active") {
        return NextResponse.json({ error: "Already a member" }, { status: 409 });
      }
      // Already pending — resend the email
    } else {
      // Create pending membership (coordinator-invited)
      await db.insert(groupMemberships).values({
        groupId,
        userId: invitee.id,
        role: "member",
        status: "pending",
        invitedBy: user.id,
      });
    }
  }

  // Send invite email (works for both existing and non-existing users)
  const baseUrl = process.env.NEXTAUTH_URL || "https://brij.extol.work";
  const joinUrl = `${baseUrl}/groups/join/${group.joinCode}`;
  const inviterName = user.name || "A coordinator";

  const resend = new Resend(process.env.AUTH_RESEND_KEY);
  await resend.emails.send({
    from: process.env.EMAIL_FROM || "brij <noreply@brij.extol.work>",
    to: trimmedEmail,
    subject: `You're invited to join ${group.name} on brij`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 16px;">
        <div style="background: #FAF7F2; border: 1px solid #e8e0d4; border-radius: 16px; padding: 32px; text-align: center;">
          <div style="width: 56px; height: 56px; border-radius: 50%; background: ${group.color}; color: white; font-size: 24px; font-weight: bold; line-height: 56px; margin: 0 auto 16px;">
            ${group.name.charAt(0).toUpperCase()}
          </div>
          <h2 style="margin: 0 0 8px; font-size: 20px; color: #1a1a1a;">${group.name}</h2>
          ${group.description ? `<p style="margin: 0 0 16px; font-size: 14px; color: #999;">${group.description}</p>` : ""}
          <p style="margin: 0 0 24px; font-size: 15px; color: #666;">
            ${inviterName} invited you to join this group on brij.
          </p>
          <a href="${joinUrl}" style="display: inline-block; padding: 14px 32px; background: #7c3aed; color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 15px;">
            Accept invite
          </a>
          <p style="margin: 24px 0 0; font-size: 12px; color: #bbb;">
            ${invitee ? "Click the button above to join." : "You'll need to create a brij account first, then you'll be added to the group."}
          </p>
        </div>
      </div>
    `,
  });

  return NextResponse.json(
    { status: "invited", email: trimmedEmail, userExists: !!invitee },
    { status: 201 }
  );
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

  if (action === "demote") {
    if (target.role !== "coordinator") {
      return NextResponse.json({ error: "Not a coordinator" }, { status: 400 });
    }

    // Check if this is the group creator — only they can demote themselves
    const group = await db.query.groups.findFirst({
      where: eq(groups.id, groupId),
    });

    if (group && target.userId === group.createdById && user.id !== group.createdById) {
      return NextResponse.json({ error: "Only the original creator can demote themselves" }, { status: 403 });
    }

    const [updated] = await db
      .update(groupMemberships)
      .set({ role: "member" })
      .where(eq(groupMemberships.id, membershipId))
      .returning();
    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "action must be 'approve', 'ignore', 'promote', or 'demote'" }, { status: 400 });
}
