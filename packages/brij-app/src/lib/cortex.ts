/**
 * Cortex push helper — fire-and-forget POST to cortex endpoints.
 *
 * All calls are best-effort: if CORTEX_URL is not set or cortex
 * is unreachable, the action proceeds without blocking.
 */

async function pushToCortex(path: string, body: Record<string, unknown>): Promise<void> {
  const cortexUrl = process.env.CORTEX_URL;
  if (!cortexUrl) return;

  const apiKey = process.env.CORTEX_API_KEY;

  try {
    await fetch(`${cortexUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
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

/** Event closed — attendance attestation (Merkle batch or individual per tier) */
export async function pushEventClosed(
  activityId: string,
  communityId: string,
  closedAt: string,
  attendees: { derivationInput: string; displayName: string; joinedAt: string | null; role: "participant" | "coordinator" }[],
  tier: "free" | "paid" = "free"
) {
  if (attendees.length === 0) return;
  await pushToCortex("/event-closed", {
    activityId,
    communityId,
    closedAt,
    tier,
    attendees,
  });
}

/** Peer attestation — one member attests another's contribution */
export function pushPeerAttestation(
  communityId: string,
  attestorDerivationInput: string,
  subjectDerivationInput: string,
  activityId: string,
  description: string,
  createdAt: string
) {
  pushToCortex("/peer-attestation", {
    communityId,
    attestorDerivationInput,
    subjectDerivationInput,
    activityId,
    description,
    createdAt,
  }).catch(() => {});
}

/** Vote closed — governance participation attestation */
export function pushVoteClosed(
  communityId: string,
  proposalId: string,
  closedAt: string,
  voters: { derivationInput: string; displayName: string }[]
) {
  // TODO: Enable after Charon's activity_type migration lands (activity_type=3)
  pushToCortex("/vote-closed", {
    communityId,
    proposalId,
    closedAt,
    voters,
  }).catch(() => {});
}

/** User deleted — GDPR PDA cleanup */
export function pushUserDeleted(communityId: string, userId: string) {
  pushToCortex("/user-deleted", { communityId, userId }).catch(() => {});
}
