/**
 * Billing tier resolution — waterfall logic.
 *
 * Resolution order (first paid tier wins):
 *   1. Group's own self-pay plan (communityPlans)
 *   2. Org plan via orgMemberships (where billingActive = true)
 *   3. Creator's individual plan (userPlans)
 *   4. Free
 */

import { db } from "@/db";
import { communityPlans, organizations, orgMemberships, userPlans, groups } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export type CommunityTier = "free" | "starter" | "team" | "organization" | "league";

const PLAN_LIMITS = {
  free: { maxGroupsPerUser: 3 },
  starter: { maxGroupsPerUser: 10 },
  team: { maxGroupsPerUser: 25 },
  organization: { maxGroupsPerUser: 100 },
  league: { maxGroupsPerUser: Infinity },
} as const;

/** Get a group's tier. Returns "free" if no plan row exists. */
export async function getGroupTier(groupId: string): Promise<CommunityTier> {
  const plan = await db.query.communityPlans.findFirst({
    where: eq(communityPlans.groupId, groupId),
  });
  return plan?.tier ?? "free";
}

/**
 * Resolve the effective tier for a group using the full waterfall.
 *
 * 1. Group self-pay → 2. Org coverage → 3. Creator individual plan → 4. Free
 */
export async function resolveGroupTier(groupId: string): Promise<CommunityTier> {
  // 1. Group's own plan
  const groupPlan = await db.query.communityPlans.findFirst({
    where: eq(communityPlans.groupId, groupId),
  });
  if (groupPlan && isPaidTier(groupPlan.tier)) {
    return groupPlan.tier;
  }

  // 2. Org coverage
  const orgLink = await db
    .select({ tier: organizations.tier })
    .from(orgMemberships)
    .innerJoin(organizations, eq(organizations.id, orgMemberships.orgId))
    .where(and(eq(orgMemberships.groupId, groupId), eq(orgMemberships.billingActive, true)))
    .limit(1);
  if (orgLink.length > 0 && isPaidTier(orgLink[0].tier)) {
    return orgLink[0].tier;
  }

  // 3. Creator's individual plan
  const group = await db.query.groups.findFirst({
    where: eq(groups.id, groupId),
    columns: { createdById: true },
  });
  if (group) {
    const userPlan = await db.query.userPlans.findFirst({
      where: eq(userPlans.userId, group.createdById),
    });
    if (userPlan && isPaidTier(userPlan.tier)) {
      return userPlan.tier;
    }
  }

  // 4. Free
  return "free";
}

/**
 * Resolve the effective tier for a user (for group creation limits).
 *
 * Checks: any group self-pay → any org coverage → user plan → free.
 * Returns the highest tier found across all paths.
 */
export async function resolveUserTier(userId: string): Promise<CommunityTier> {
  // Check user's individual plan first (cheapest query)
  const userPlan = await db.query.userPlans.findFirst({
    where: eq(userPlans.userId, userId),
  });
  if (userPlan && isPaidTier(userPlan.tier)) {
    return userPlan.tier;
  }

  // Check if user has any paid groups (self-pay or org-covered)
  const userGroups = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.createdById, userId));

  for (const g of userGroups) {
    const tier = await resolveGroupTier(g.id);
    if (isPaidTier(tier)) {
      return tier;
    }
  }

  return "free";
}

/** Whether a tier is paid (any non-free tier). */
export function isPaidTier(tier: CommunityTier): boolean {
  return tier !== "free";
}

/** Max groups a user can create based on their resolved tier. */
export function getMaxGroups(tier: CommunityTier): number {
  return PLAN_LIMITS[tier].maxGroupsPerUser;
}
