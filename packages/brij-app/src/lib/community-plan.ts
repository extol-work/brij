/**
 * Community plan helpers — tier lookup and plan limits.
 */

import { db } from "@/db";
import { communityPlans } from "@/db/schema";
import { eq } from "drizzle-orm";

export type CommunityTier = "free" | "starter" | "team" | "organization" | "league";

const PLAN_LIMITS = {
  free: { maxGroupsPerUser: 3 },
  starter: { maxGroupsPerUser: Infinity },
  team: { maxGroupsPerUser: Infinity },
  organization: { maxGroupsPerUser: Infinity },
  league: { maxGroupsPerUser: Infinity },
} as const;

/** Get a group's tier. Returns "free" if no plan row exists. */
export async function getGroupTier(groupId: string): Promise<CommunityTier> {
  const plan = await db.query.communityPlans.findFirst({
    where: eq(communityPlans.groupId, groupId),
  });
  return plan?.tier ?? "free";
}

/** Whether a tier is paid (any non-free tier). */
export function isPaidTier(tier: CommunityTier): boolean {
  return tier !== "free";
}

/** Max groups a user can create. Paid = unlimited. */
export function getMaxGroups(tier: CommunityTier): number {
  return PLAN_LIMITS[tier].maxGroupsPerUser;
}
