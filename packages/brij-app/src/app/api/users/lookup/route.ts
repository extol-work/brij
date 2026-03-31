import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/** GET /api/users/lookup?email=... — check if a user exists by email (authenticated only) */
export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const found = await db.query.users.findFirst({
    where: eq(users.email, email),
    columns: { id: true, name: true, image: true },
  });

  if (!found) {
    return NextResponse.json({ exists: false });
  }

  return NextResponse.json({ exists: true, name: found.name, image: found.image });
}
