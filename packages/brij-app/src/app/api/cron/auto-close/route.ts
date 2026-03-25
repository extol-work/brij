import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { eq, and, lt, isNotNull } from "drizzle-orm";

/**
 * GET /api/cron/auto-close — close stale activities
 *
 * Closes all open activities where endsAt has passed.
 * Runs hourly via Vercel Cron.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const closed = await db
    .update(activities)
    .set({ status: "closed", closedAt: now, updatedAt: now })
    .where(
      and(
        eq(activities.status, "open"),
        isNotNull(activities.endsAt),
        lt(activities.endsAt, now),
      )
    )
    .returning({ id: activities.id, title: activities.title });

  console.log(`[cron:auto-close] Closed ${closed.length} stale activities`);

  return NextResponse.json({ closed: closed.length, activities: closed });
}
