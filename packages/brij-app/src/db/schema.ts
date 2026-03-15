import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// --- Enums ---

export const activityStatusEnum = pgEnum("activity_status", [
  "draft",
  "open",
  "closed",
]);

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "coming",
  "checked_in",
]);

export const recurringFrequencyEnum = pgEnum("recurring_frequency", [
  "weekly",
  "biweekly",
  "monthly",
]);

export const contributionTypeEnum = pgEnum("contribution_type", [
  "attendance",
  "labor",
  "supply",
  "cash",
  "other",
]);

export const groupRoleEnum = pgEnum("group_role", [
  "coordinator",
  "member",
]);

// --- Auth.js tables ---

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  consentedAt: timestamp("consented_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ]
);

// --- Groups ---

export const groups = pgTable("groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").default("#7c3aed").notNull(), // hex for avatar
  createdById: uuid("created_by_id")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Group Memberships ---

export const groupMemberships = pgTable("group_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  role: groupRoleEnum("role").default("member").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }), // for unread dots
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique().on(table.groupId, table.userId),
]);

// --- Journal Entries ---

export const journalEntries = pgTable("journal_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull(),
  authorId: uuid("author_id")
    .references(() => users.id)
    .notNull(),
  text: text("text").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete, no edit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Activities ---

export const activities = pgTable("activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  coordinatorId: uuid("coordinator_id")
    .references(() => users.id)
    .notNull(),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "set null" }), // nullable — personal or group activity
  status: activityStatusEnum("status").default("draft").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  location: text("location"),
  shareCode: text("share_code").unique().notNull(),
  isRecurring: boolean("is_recurring").default(false).notNull(),
  recurringFrequency: recurringFrequencyEnum("recurring_frequency"),
  seriesId: uuid("series_id"),
  activityType: text("activity_type"),
  photoUrl: text("photo_url"),
  summary: text("summary"),
  sentiment: text("sentiment"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Attendance ---

export const attendances = pgTable("attendances", {
  id: uuid("id").defaultRandom().primaryKey(),
  activityId: uuid("activity_id")
    .references(() => activities.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id").references(() => users.id),
  guestName: text("guest_name"),
  status: attendanceStatusEnum("status").default("coming").notNull(),
  rsvpAt: timestamp("rsvp_at", { withTimezone: true }).defaultNow().notNull(),
  checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
});

// --- Contributions ---

export const contributions = pgTable("contributions", {
  id: uuid("id").defaultRandom().primaryKey(),
  activityId: uuid("activity_id")
    .references(() => activities.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id").references(() => users.id),
  guestName: text("guest_name"),
  type: contributionTypeEnum("type").notNull(),
  description: text("description"),
  quantity: integer("quantity"),
  unit: text("unit"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Peer Attestations ---

export const peerAttestations = pgTable("peer_attestations", {
  id: uuid("id").defaultRandom().primaryKey(),
  activityId: uuid("activity_id")
    .references(() => activities.id, { onDelete: "cascade" })
    .notNull(),
  attesterId: uuid("attester_id")
    .references(() => users.id)
    .notNull(),
  attesteeId: uuid("attestee_id")
    .references(() => users.id)
    .notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
