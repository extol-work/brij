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

export type BrijEventPayload =
  | ActivityCompletedEvent
  | AttendanceConfirmedEvent
  | ContributionLoggedEvent
  | UserDeletedEvent
  | PeerAttestationEvent;

/** Convenience alias — a fully wrapped event */
export type BrijEvent = BrijEventEnvelope;
