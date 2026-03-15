import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { journalEntries, groupMemberships, users } from "@/db/schema";
import { eq, and, isNull, desc, gt } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

/** GET /api/groups/:id/journal — list journal entries (newest first) */
export async function GET(req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;

  // Verify membership
  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, groupId),
      eq(groupMemberships.userId, user.id),
      eq(groupMemberships.status, "active")
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Optional ?since= param for polling
  const since = req.nextUrl.searchParams.get("since");

  const whereConditions = [
    eq(journalEntries.groupId, groupId),
    isNull(journalEntries.deletedAt),
  ];

  if (since) {
    whereConditions.push(gt(journalEntries.createdAt, new Date(since)));
  }

  const entries = await db
    .select({
      id: journalEntries.id,
      text: journalEntries.text,
      activityId: journalEntries.activityId,
      createdAt: journalEntries.createdAt,
      authorId: journalEntries.authorId,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(journalEntries)
    .innerJoin(users, eq(users.id, journalEntries.authorId))
    .where(and(...whereConditions))
    .orderBy(desc(journalEntries.createdAt))
    .limit(100);

  return NextResponse.json(entries);
}

/** POST /api/groups/:id/journal — create a journal entry */
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;

  // Verify membership
  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, groupId),
      eq(groupMemberships.userId, user.id),
      eq(groupMemberships.status, "active")
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const body = await req.json();
  const { text, activityId } = body;

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const [entry] = await db
    .insert(journalEntries)
    .values({
      groupId,
      authorId: user.id,
      activityId: activityId || null,
      text: text.trim(),
    })
    .returning();

  return NextResponse.json({
    ...entry,
    authorName: user.name,
    authorEmail: user.email,
  }, { status: 201 });
}

/** DELETE /api/groups/:id/journal — soft-delete a journal entry */
export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;

  const body = await req.json();
  const { entryId } = body;

  if (!entryId) {
    return NextResponse.json({ error: "entryId is required" }, { status: 400 });
  }

  const entry = await db.query.journalEntries.findFirst({
    where: and(
      eq(journalEntries.id, entryId),
      eq(journalEntries.groupId, groupId),
      isNull(journalEntries.deletedAt)
    ),
  });

  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  // Author can delete own, coordinator can delete any
  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, groupId),
      eq(groupMemberships.userId, user.id)
    ),
  });

  if (entry.authorId !== user.id && membership?.role !== "coordinator") {
    return NextResponse.json({ error: "Cannot delete this entry" }, { status: 403 });
  }

  await db
    .update(journalEntries)
    .set({ deletedAt: new Date() })
    .where(eq(journalEntries.id, entryId));

  return NextResponse.json({ ok: true });
}
