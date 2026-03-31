/**
 * DELETE /api/settings/api-keys/[id] — revoke a bot API key
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { botApiKeys, groupMemberships } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Look up the key
  const key = await db.query.botApiKeys.findFirst({
    where: eq(botApiKeys.id, id),
  });

  if (!key) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  // Verify user is coordinator of the key's group
  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, key.groupId),
      eq(groupMemberships.userId, user.id),
      eq(groupMemberships.role, "coordinator"),
      eq(groupMemberships.status, "active")
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Soft-revoke
  await db
    .update(botApiKeys)
    .set({ revokedAt: new Date() })
    .where(eq(botApiKeys.id, id));

  return NextResponse.json({ ok: true });
}
