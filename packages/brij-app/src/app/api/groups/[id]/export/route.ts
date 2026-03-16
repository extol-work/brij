import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import {
  groupMemberships,
  groups,
  journalEntries,
  users,
  activities,
  attendances,
} from "@/db/schema";
import { eq, and, gte, lte, isNull, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

/** GET /api/groups/:id/export?type=journal|members — coordinator-only CSV export */
export async function GET(req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;

  // Verify coordinator
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

  const group = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
  });

  const type = req.nextUrl.searchParams.get("type");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  if (type === "journal") {
    return exportJournal(groupId, group?.name || "group", from, to);
  }
  if (type === "members") {
    return exportMembers(groupId, group?.name || "group");
  }

  return NextResponse.json({ error: "type must be 'journal' or 'members'" }, { status: 400 });
}

async function exportJournal(groupId: string, groupName: string, from: string | null, to: string | null) {
  const entries = await db
    .select({
      text: journalEntries.text,
      createdAt: journalEntries.createdAt,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(journalEntries)
    .innerJoin(users, eq(users.id, journalEntries.authorId))
    .where(
      and(
        eq(journalEntries.groupId, groupId),
        isNull(journalEntries.deletedAt),
        ...(from ? [gte(journalEntries.createdAt, new Date(from))] : []),
        ...(to ? [lte(journalEntries.createdAt, new Date(to + "T23:59:59Z"))] : [])
      )
    )
    .orderBy(journalEntries.createdAt);

  const rows = ["date,time,member_name,entry_text"];
  for (const e of entries) {
    const d = new Date(e.createdAt);
    rows.push(csvRow([
      d.toISOString().split("T")[0],
      d.toISOString().split("T")[1]?.slice(0, 5) || "",
      e.authorName || e.authorEmail.split("@")[0],
      e.text,
    ]));
  }

  const filename = `${groupName.replace(/[^a-zA-Z0-9]/g, "-")}-journal.csv`;
  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function exportMembers(groupId: string, groupName: string) {
  const members = await db
    .select({
      name: users.name,
      email: users.email,
      role: groupMemberships.role,
      joinedAt: groupMemberships.joinedAt,
      userId: groupMemberships.userId,
    })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .where(
      and(
        eq(groupMemberships.groupId, groupId),
        eq(groupMemberships.status, "active")
      )
    );

  // Get activity + journal counts per member
  const rows = ["name,email,role,joined_date,total_activities,total_journal_entries"];
  for (const m of members) {
    const [actCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(attendances)
      .innerJoin(activities, eq(activities.id, attendances.activityId))
      .where(
        and(
          eq(attendances.userId, m.userId),
          eq(activities.groupId, groupId)
        )
      );

    const [journalCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.groupId, groupId),
          eq(journalEntries.authorId, m.userId),
          isNull(journalEntries.deletedAt)
        )
      );

    const d = new Date(m.joinedAt);
    rows.push(csvRow([
      m.name || m.email.split("@")[0],
      m.email,
      m.role,
      d.toISOString().split("T")[0],
      String(actCount?.count || 0),
      String(journalCount?.count || 0),
    ]));
  }

  const filename = `${groupName.replace(/[^a-zA-Z0-9]/g, "-")}-members.csv`;
  return new NextResponse(rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csvRow(fields: string[]): string {
  return fields.map((f) => `"${f.replace(/"/g, '""')}"`).join(",");
}
