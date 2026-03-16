import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    id: user.id,
    displayName: user.name,
    email: user.email,
    consentedAt: user.consentedAt,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (body.name !== undefined) {
    await db
      .update(users)
      .set({ name: body.name?.trim() || null })
      .where(eq(users.id, user.id));
  }

  return NextResponse.json({ ok: true });
}
