import { NextRequest, NextResponse } from "next/server";
import { checkAllMilestones } from "@/lib/milestones";

/**
 * GET /api/cron/milestones — daily milestone check
 *
 * Triggered by Vercel Cron at 6am UTC.
 * Checks all groups for: first_active_week, streak_10, streak_25.
 * (first_activity_3plus is event-driven, not cron.)
 */
export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sets this automatically for cron requests)
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await checkAllMilestones();

  console.log(`[cron:milestones] Checked ${result.checked} groups, awarded ${result.awarded} milestones`);

  return NextResponse.json(result);
}
