import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { expenseEntries, expenseConfirmations, groupMemberships, users } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { pushExpenseConfirmed } from "@/lib/cortex";

type Params = { params: Promise<{ id: string }> };

/** GET /api/groups/:id/expenses — list expense entries with confirmations */
export async function GET(_req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;

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

  const entries = await db
    .select({
      id: expenseEntries.id,
      description: expenseEntries.description,
      amount: expenseEntries.amount,
      currency: expenseEntries.currency,
      date: expenseEntries.date,
      authorId: expenseEntries.authorId,
      authorName: users.name,
      authorEmail: users.email,
      createdAt: expenseEntries.createdAt,
    })
    .from(expenseEntries)
    .innerJoin(users, eq(users.id, expenseEntries.authorId))
    .where(eq(expenseEntries.groupId, groupId))
    .orderBy(desc(expenseEntries.createdAt));

  // Fetch confirmations for each entry
  const result = await Promise.all(
    entries.map(async (entry) => {
      const confirmations = await db
        .select({
          id: expenseConfirmations.id,
          confirmedById: expenseConfirmations.confirmedById,
          confirmedByName: users.name,
        })
        .from(expenseConfirmations)
        .innerJoin(users, eq(users.id, expenseConfirmations.confirmedById))
        .where(eq(expenseConfirmations.entryId, entry.id));

      return { ...entry, confirmations };
    })
  );

  return NextResponse.json(result);
}

/** POST /api/groups/:id/expenses — create an expense entry (coordinator only) */
export async function POST(req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;

  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, groupId),
      eq(groupMemberships.userId, user.id),
      eq(groupMemberships.role, "coordinator"),
      eq(groupMemberships.status, "active")
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Must be coordinator" }, { status: 403 });
  }

  const body = await req.json();
  const { description, amount, currency, date } = body;

  if (!description || !amount || !date) {
    return NextResponse.json({ error: "description, amount, and date required" }, { status: 400 });
  }

  const [entry] = await db
    .insert(expenseEntries)
    .values({
      groupId,
      authorId: user.id,
      description: description.trim(),
      amount: amount.toString(),
      currency: currency || "USD",
      date,
    })
    .returning();

  return NextResponse.json({
    ...entry,
    authorName: user.name,
    authorEmail: user.email,
    confirmations: [],
  }, { status: 201 });
}

/** PATCH /api/groups/:id/expenses — confirm an expense entry (any coordinator) */
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;

  const membership = await db.query.groupMemberships.findFirst({
    where: and(
      eq(groupMemberships.groupId, groupId),
      eq(groupMemberships.userId, user.id),
      eq(groupMemberships.role, "coordinator"),
      eq(groupMemberships.status, "active")
    ),
  });

  if (!membership) {
    return NextResponse.json({ error: "Must be coordinator" }, { status: 403 });
  }

  const body = await req.json();
  const { entryId } = body;

  if (!entryId) {
    return NextResponse.json({ error: "entryId required" }, { status: 400 });
  }

  // Verify entry belongs to this group
  const entry = await db.query.expenseEntries.findFirst({
    where: and(
      eq(expenseEntries.id, entryId),
      eq(expenseEntries.groupId, groupId)
    ),
  });

  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  // Can't confirm your own entry
  if (entry.authorId === user.id) {
    return NextResponse.json({ error: "Cannot confirm your own entry" }, { status: 400 });
  }

  const [confirmation] = await db
    .insert(expenseConfirmations)
    .values({
      entryId,
      confirmedById: user.id,
    })
    .returning();

  // Push attestation to cortex
  pushExpenseConfirmed(
    groupId,
    entryId,
    entry.authorId,
    user.id,
    entry.amount,
    entry.currency,
    entry.description,
    new Date().toISOString()
  );

  return NextResponse.json({
    ...confirmation,
    confirmedByName: user.name,
  });
}
