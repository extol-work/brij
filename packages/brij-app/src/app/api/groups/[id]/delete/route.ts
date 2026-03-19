import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { groups, groupMemberships } from "@/db/schema";
import { eq, and } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/groups/:id/delete — soft-delete a group (original creator only)
 *
 * Sets deletedAt on the group, removes all memberships.
 * Journal entries and activities are preserved but inaccessible.
 * On-chain attestations remain (immutable).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;

  // Only original creator can delete
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
  });

  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  if (group.deletedAt) {
    return NextResponse.json({ error: "Group already deleted" }, { status: 400 });
  }

  if (group.createdById !== user.id) {
    return NextResponse.json({ error: "Only the original creator can delete this group" }, { status: 403 });
  }

  // Verify confirmation matches group name
  const body = await req.json();
  if (body.confirmName !== group.name) {
    return NextResponse.json({ error: "Group name does not match" }, { status: 400 });
  }

  // Soft-delete the group
  await db
    .update(groups)
    .set({ deletedAt: new Date() })
    .where(eq(groups.id, groupId));

  // Remove all memberships
  await db
    .delete(groupMemberships)
    .where(eq(groupMemberships.groupId, groupId));

  return NextResponse.json({ ok: true });
}
