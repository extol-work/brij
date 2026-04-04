import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { groupMemberships, users } from "@/db/schema";
import { eq, and, or, ilike } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

/** GET /api/groups/:id/members/search?q=name — typeahead for collaborator picker */
export async function GET(req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: groupId } = await params;
  const q = req.nextUrl.searchParams.get("q")?.trim() || "";

  if (q.length < 1) {
    return NextResponse.json([]);
  }

  // Verify caller is a member of this group
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

  // Search active members by name or email prefix
  const pattern = `%${q}%`;
  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .where(
      and(
        eq(groupMemberships.groupId, groupId),
        eq(groupMemberships.status, "active"),
        or(
          ilike(users.name, pattern),
          ilike(users.email, pattern)
        )
      )
    )
    .limit(10);

  // Exclude the searching user
  const results = members
    .filter((m) => m.id !== user.id)
    .map((m) => ({
      id: m.id,
      displayName: m.name || m.email.split("@")[0],
    }));

  return NextResponse.json(results);
}
