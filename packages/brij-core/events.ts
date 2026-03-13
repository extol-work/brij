/**
 * BrijEvent — the public event contract between Brij and downstream consumers.
 *
 * v0.2: Extol middleware polls Brij's DB and constructs these events itself.
 * v0.5+: Brij emits natively via webhooks; Extol subscribes. Same shapes.
 *
 * Breaking changes to these types follow semver.
 */

export interface ActivityCompletedEvent {
  type: "activity.completed";
  activityId: string;
  title: string;
  coordinatorId: string;
  completedAt: string;
  attendeeCount: number;
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
  contributionType: string;
  description: string | null;
}

export interface UserDeletedEvent {
  type: "user.deleted";
  userId: string;
  deletedAt: string;
}

export type BrijEvent =
  | ActivityCompletedEvent
  | AttendanceConfirmedEvent
  | ContributionLoggedEvent
  | UserDeletedEvent;
