import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("avatar") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (5MB max)" }, { status: 400 });
  }

  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
  }

  // Delete old custom avatar if it's a blob URL
  const existing = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { image: true },
  });
  if (existing?.image?.includes("vercel-storage.com")) {
    try {
      await del(existing.image);
    } catch {
      // Old blob may already be gone
    }
  }

  const blob = await put(`avatars/${user.id}/${Date.now()}.jpg`, file, {
    access: "public",
    contentType: "image/jpeg",
  });

  await db
    .update(users)
    .set({ image: blob.url })
    .where(eq(users.id, user.id));

  return NextResponse.json({ image: blob.url });
}

export async function DELETE() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { image: true },
  });

  if (existing?.image?.includes("vercel-storage.com")) {
    try {
      await del(existing.image);
    } catch {
      // Already gone
    }
  }

  await db
    .update(users)
    .set({ image: null })
    .where(eq(users.id, user.id));

  return NextResponse.json({ ok: true });
}
