/**
 * Cortex push helper — fire-and-forget POST to cortex endpoints.
 *
 * All calls are best-effort: if CORTEX_URL is not set or cortex
 * is unreachable, the action proceeds without blocking.
 */

async function pushToCortex(path: string, body: Record<string, unknown>): Promise<void> {
  const cortexUrl = process.env.CORTEX_URL;
  if (!cortexUrl) return;

  try {
    await fetch(`${cortexUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Best-effort — don't block the action
  }
}

/** Group creation attestation — permanent founding proof */
export function pushGroupCreated(communityId: string, creatorId: string, groupName: string, createdAt: string) {
  pushToCortex("/group-created", { communityId, creatorId, groupName, createdAt }).catch(() => {});
}

/** Expense confirmed — two-party financial attestation */
export function pushExpenseConfirmed(
  communityId: string,
  entryId: string,
  loggedBy: string,
  confirmedBy: string,
  amount: string,
  currency: string,
  description: string,
  confirmedAt: string
) {
  pushToCortex("/expense-confirmed", {
    communityId,
    entryId,
    loggedBy,
    confirmedBy,
    amount,
    currency,
    description,
    confirmedAt,
  }).catch(() => {});
}

/** Milestone achieved — permanent group trophy */
export function pushMilestoneAchieved(communityId: string, milestoneType: string, achievedAt: string) {
  pushToCortex("/milestone-achieved", { communityId, milestoneType, achievedAt }).catch(() => {});
}

/** User deleted — GDPR PDA cleanup */
export function pushUserDeleted(communityId: string, userId: string) {
  pushToCortex("/user-deleted", { communityId, userId }).catch(() => {});
}
