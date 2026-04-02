import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { eq, and } from "drizzle-orm";
import { generateAndStoreCard } from "@/lib/generate-card";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), eq(activities.coordinatorId, user.id)),
  });
  if (!activity) {
    return NextResponse.json({ error: "Not found or not owner" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("photo") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No photo provided" }, { status: 400 });
  }

  // Validate file size (5MB max)
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large (5MB max)" }, { status: 400 });
  }

  // Validate MIME type
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Invalid file type (JPEG, PNG, or WebP only)" }, { status: 400 });
  }

  // Delete old photo if replacing
  if (activity.photoUrl) {
    try {
      await del(activity.photoUrl);
    } catch {
      // Old blob may already be gone — continue
    }
  }

  const blob = await put(`activity-photos/${id}/${Date.now()}.jpg`, file, {
    access: "public",
    contentType: "image/jpeg",
  });

  const [updated] = await db
    .update(activities)
    .set({ photoUrl: blob.url, updatedAt: new Date() })
    .where(eq(activities.id, id))
    .returning();

  // Regenerate the Extol Card so it uses the new photo
  if (updated.cardUrl) {
    const baseUrl = req.nextUrl.origin;
    generateAndStoreCard(id, baseUrl).catch(() => {});
  }

  return NextResponse.json({ photoUrl: updated.photoUrl });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const activity = await db.query.activities.findFirst({
    where: and(eq(activities.id, id), eq(activities.coordinatorId, user.id)),
  });
  if (!activity) {
    return NextResponse.json({ error: "Not found or not owner" }, { status: 404 });
  }

  if (activity.photoUrl) {
    try {
      await del(activity.photoUrl);
    } catch {
      // Already gone
    }
  }

  await db
    .update(activities)
    .set({ photoUrl: null, updatedAt: new Date() })
    .where(eq(activities.id, id));

  // Regenerate card with default background
  if (activity.cardUrl) {
    const baseUrl = _req.nextUrl.origin;
    generateAndStoreCard(id, baseUrl).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
