import { NextRequest, NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { eq, and } from "drizzle-orm";

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

  return NextResponse.json({ ok: true });
}
