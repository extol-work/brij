import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { generateAndStoreCard } from "@/lib/generate-card";
import { desc, isNotNull } from "drizzle-orm";

const ADMIN_EMAIL = "ken@extol.work";

/**
 * POST /api/admin/regenerate-cards
 *
 * Regenerate the most recent 20 closed activities' Extol Card images.
 * Admin-only (ken@extol.work). One-time use after card template changes.
 */
async function handleRegenerate(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Get 20 most recent closed activities with summaries
  const recentActivities = await db.query.activities.findMany({
    where: isNotNull(activities.closedAt),
    orderBy: [desc(activities.closedAt)],
    limit: 20,
  });

  const baseUrl = new URL(req.url).origin;
  const results: { id: string; title: string; ok: boolean; url?: string }[] = [];

  for (const activity of recentActivities) {
    const url = await generateAndStoreCard(activity.id, baseUrl);
    results.push({
      id: activity.id,
      title: activity.title,
      ok: url !== null,
      ...(url ? { url } : {}),
    });
  }

  const succeeded = results.filter((r) => r.ok).length;
  return NextResponse.json({
    regenerated: succeeded,
    total: recentActivities.length,
    results,
  });
}

export async function POST(req: NextRequest) {
  return handleRegenerate(req);
}

export async function GET(req: NextRequest) {
  return handleRegenerate(req);
}
