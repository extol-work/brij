import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * POST /api/cortex/callback
 *
 * Called by Cortex after an on-chain attestation tx is confirmed (or failed).
 * Updates the activity's attestationStatus so downstream consumers
 * (Tempo exports, /me page, admin views) know the on-chain status.
 *
 * Body: { activityId: string, status: "confirmed" | "failed", txSignature?: string, error?: string }
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.CORTEX_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (!auth || auth !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { activityId, status, txSignature, error: errorMsg } = body as {
    activityId?: string;
    status?: string;
    txSignature?: string;
    error?: string;
  };

  if (!activityId || !status) {
    return NextResponse.json({ error: "Missing activityId or status" }, { status: 400 });
  }

  if (status !== "confirmed" && status !== "failed") {
    return NextResponse.json({ error: "Invalid status, expected 'confirmed' or 'failed'" }, { status: 400 });
  }

  if (status === "failed") {
    console.error(`[cortex-callback] Attestation failed for activity ${activityId}: ${errorMsg ?? "no reason given"}`);
  }

  const [updated] = await db
    .update(activities)
    .set({
      attestationStatus: status,
      ...(txSignature && { txSignature }),
    })
    .where(eq(activities.id, activityId))
    .returning({ id: activities.id });

  if (!updated) {
    return NextResponse.json({ error: "Activity not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, activityId: updated.id, attestationStatus: status });
}
