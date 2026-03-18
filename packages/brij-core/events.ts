/**
 * BrijEvent — the public event contract between Brij and downstream consumers.
 *
 * v0.2: Extol middleware polls Brij's DB and constructs these events itself.
 * v0.5+: Brij emits natively via webhooks; Extol subscribes. Same shapes.
 *
 * Breaking changes to these types follow semver.
 */

// ---------------------------------------------------------------------------
// Envelope — every event gets wrapped with metadata for ordering + idempotency
// ---------------------------------------------------------------------------

export interface BrijEventEnvelope<T extends BrijEventPayload = BrijEventPayload> {
  /** Unique event ID (UUID) — idempotency key for consumers */
  id: string;
  /** ISO-8601 timestamp when the event occurred */
  timestamp: string;
  /** Monotonic sequence for ordering within a poll batch */
  sequence: number;
  /** Event payload */
  data: T;
}

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

export interface ActivityCompletedEvent {
  type: "activity.completed";
  activityId: string;
  title: string;
  coordinatorId: string;
  completedAt: string;
  attendeeCount: number;
  /** Summary written by coordinator at closure */
  summary: string | null;
  sentiment: string | null;
  location: string | null;
  activityType: string | null;
  /** Series context for recurring activities */
  seriesId: string | null;
  isRecurring: boolean;
}

export interface AttendanceConfirmedEvent {
  type: "attendance.confirmed";
  activityId: string;
  userId: string | null;
  guestName: string | null;
  checkedInAt: string;
  /** Check-in latitude (WGS84). Null if location not captured. */
  latitude: number | null;
  /** Check-in longitude (WGS84). Null if location not captured. */
  longitude: number | null;
}

export interface ContributionLoggedEvent {
  type: "contribution.logged";
  activityId: string;
  userId: string | null;
  guestName: string | null;
  contributionType: "attendance" | "labor" | "supply" | "cash" | "other";
  description: string | null;
  quantity: number | null;
  unit: string | null;
}

export interface UserDeletedEvent {
  type: "user.deleted";
  userId: string;
  deletedAt: string;
}

export interface PeerAttestationEvent {
  type: "peer.attested";
  activityId: string;
  attesterId: string;
  attesteeId: string;
  note: string | null;
  createdAt: string;
}

export interface JournalDigestEvent {
  type: "journal.digest";
  /** Group ID — a brij group IS the community for attestation */
  communityId: string;
  /** Start of the digest period (YYYY-MM-DD, Monday) */
  periodStart: string;
  /** End of the digest period (YYYY-MM-DD, Sunday) */
  periodEnd: string;
  /** Number of non-deleted journal entries in this digest */
  entryCount: number;
  /** Number of unique authors */
  uniqueAuthors: number;
  /** SHA-256 hex of sorted concatenated per-entry hashes */
  digest: string;
}

export interface ExpenseConfirmedEvent {
  type: "expense.confirmed";
  communityId: string;
  /** The expense entry being confirmed */
  entryId: string;
  /** User who logged the expense */
  loggedBy: string;
  /** User who confirmed/witnessed the expense */
  confirmedBy: string;
  /** Amount as string to avoid floating point (e.g., "150.00") */
  amount: string;
  /** ISO 4217 currency code */
  currency: string;
  description: string;
  confirmedAt: string;
}

export interface MilestoneAchievedEvent {
  type: "milestone.achieved";
  communityId: string;
  /** e.g., "first_activity_3plus", "first_active_week", "streak_10", "streak_25" */
  milestoneType: string;
  achievedAt: string;
}

export interface GroupCreatedEvent {
  type: "group.created";
  communityId: string;
  creatorId: string;
  groupName: string;
  createdAt: string;
}

export type BrijEventPayload =
  | ActivityCompletedEvent
  | AttendanceConfirmedEvent
  | ContributionLoggedEvent
  | UserDeletedEvent
  | PeerAttestationEvent
  | JournalDigestEvent
  | ExpenseConfirmedEvent
  | MilestoneAchievedEvent
  | GroupCreatedEvent;

/** Convenience alias — a fully wrapped event */
export type BrijEvent = BrijEventEnvelope;
