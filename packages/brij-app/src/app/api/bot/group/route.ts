import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { authenticateBot } from "@/lib/bot-auth";
import { eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const auth = await authenticateBot(req, "read");
  if (auth instanceof NextResponse) return auth;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activities)
    .where(eq(activities.groupId, auth.groupId));

  return NextResponse.json({
    id: auth.group.id,
    name: auth.group.name,
    member_count: auth.group.memberCount,
    activity_count: countRow?.count ?? 0,
    cover_image_url: auth.group.coverImageUrl,
    platform: auth.group.platform,
    join_url: `https://brij.extol.work/groups/join/${auth.groupId}`,
    tier: auth.tier,
    batch_cap: auth.batchCap,
    max_concurrent_activities: auth.limits.concurrentActivities === -1 ? "unlimited" : auth.limits.concurrentActivities,
    max_active_proposals: auth.limits.activeProposals === -1 ? "unlimited" : auth.limits.activeProposals,
  });
}
