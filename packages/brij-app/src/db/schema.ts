import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  decimal,
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

export const attendanceRoleEnum = pgEnum("attendance_role", [
  "participant",
  "coordinator",
]);

export const groupRoleEnum = pgEnum("group_role", [
  "coordinator",
  "member",
]);

export const groupMemberStatusEnum = pgEnum("group_member_status", [
  "active",
  "pending",
]);

export const groupTypeEnum = pgEnum("group_type", [
  "creative",
  "sports",
  "oss",
  "nonprofit",
  "other",
]);

export const trackEnum = pgEnum("track", [
  "governance_only",
  "credit_economy",
  "full_economic",
]);

export const entityTypeEnum = pgEnum("entity_type", [
  "informal",
  "una",
  "duna",
  "nonprofit_corp",
  "llc",
  "fiscal_sponsored",
]);

export const taxExemptStatusEnum = pgEnum("tax_exempt_status", [
  "501c3",
  "501c4",
  "501c6",
  "501c7",
  "pending",
  "none",
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
  type: groupTypeEnum("type").default("other").notNull(),
  color: text("color").default("#7c3aed").notNull(), // hex for avatar
  joinCode: text("join_code").unique().notNull(),
  membershipMode: text("membership_mode").default("invite_only").notNull(), // invite_only | open
  createdById: uuid("created_by_id")
    .references(() => users.id)
    .notNull(),
  coverImageUrl: text("cover_image_url"),
  platform: text("platform"), // 'discord', 'telegram', null
  platformGuildId: text("platform_guild_id"), // Discord guild ID, Telegram chat ID
  // Track + entity metadata (EXT-145)
  track: trackEnum("track").default("governance_only").notNull(),
  entityType: entityTypeEnum("entity_type"),
  ein: text("ein"), // EIN for tax-exempt orgs
  taxExemptStatus: taxExemptStatusEnum("tax_exempt_status"),
  stateOfIncorporation: text("state_of_incorporation"),
  fiscalSponsorId: uuid("fiscal_sponsor_id").references(() => organizations.id),
  keysIssuedCount: integer("keys_issued_count").default(0).notNull(), // anti-gaming: tracks total bot keys ever issued
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
  status: groupMemberStatusEnum("status").default("active").notNull(),
  invitedBy: uuid("invited_by").references(() => users.id), // set when coordinator invites — distinguishes from self-requested pending
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
  activityId: uuid("activity_id")
    .references(() => activities.id, { onDelete: "cascade" }), // null = group-level, set = activity-scoped
  text: text("text").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete, no edit
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
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
  isPrivate: boolean("is_private").default(false).notNull(),
  status: activityStatusEnum("status").default("draft").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  location: text("location"),
  shareCode: text("share_code").unique().notNull(),
  isRecurring: boolean("is_recurring").default(false).notNull(),
  recurringFrequency: recurringFrequencyEnum("recurring_frequency"),
  seriesId: uuid("series_id"),
  activityType: text("activity_type"),
  platformEventId: text("platform_event_id"), // Discord event ID, etc.
  photoUrl: text("photo_url"),
  cardUrl: text("card_url"), // pre-generated card image in Vercel Blob
  summary: text("summary"),
  sentiment: text("sentiment"),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  attestationStatus: text("attestation_status").default("none"), // 'none' | 'pending' | 'confirmed' | 'failed'
  txSignature: text("tx_signature"), // Solana tx signature once confirmed on-chain
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
  platformIdentityId: uuid("platform_identity_id")
    .references(() => platformIdentities.id),
  role: attendanceRoleEnum("role").default("participant").notNull(),
  attestationLevel: text("attestation_level").default("none"), // 'none' | 'merkle' | 'individual'
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
});

// --- Event Contributions (legacy: in-kind contributions to events) ---

export const eventContributions = pgTable("event_contributions", {
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

// --- Contributions (group-scoped work contributions) ---

export const contributions = pgTable("contributions", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull(),
  description: text("description").notNull(),
  evidenceUrl: text("evidence_url"),
  createdBy: uuid("created_by")
    .references(() => users.id)
    .notNull(),
  attestationStatus: text("attestation_status").default("none"), // 'none' | 'pending' | 'confirmed' | 'failed'
  txSignature: text("tx_signature"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Contribution Members (collaborator tagging + confirmation) ---

export const contributionMembers = pgTable("contribution_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  contributionId: uuid("contribution_id")
    .references(() => contributions.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  confirmed: boolean("confirmed").default(false).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
}, (table) => [
  unique().on(table.contributionId, table.userId),
]);

// --- Attestation Edges (materialized graph for weight calculations) ---

export const attestationEdges = pgTable("attestation_edges", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull(),
  attestorId: uuid("attestor_id")
    .references(() => users.id)
    .notNull(),
  subjectId: uuid("subject_id")
    .references(() => users.id)
    .notNull(),
  edgeType: text("edge_type").notNull(), // 'co_attendance', 'peer_witness', 'contribution_confirmation'
  sourceId: uuid("source_id").notNull(), // activity ID or contribution ID
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique().on(table.attestorId, table.subjectId, table.edgeType, table.sourceId),
]);

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

// --- Expense Entries (financial log) ---

export const expenseEntries = pgTable("expense_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull(),
  authorId: uuid("author_id")
    .references(() => users.id)
    .notNull(),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").default("USD").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Expense Confirmations (peer verification) ---

export const expenseConfirmations = pgTable("expense_confirmations", {
  id: uuid("id").defaultRandom().primaryKey(),
  entryId: uuid("entry_id")
    .references(() => expenseEntries.id, { onDelete: "cascade" })
    .notNull(),
  confirmedById: uuid("confirmed_by_id")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique().on(table.entryId, table.confirmedById),
]);

// --- Bot API Keys ---

export const botApiKeyTierEnum = pgEnum("bot_api_key_tier", [
  "free",
  "starter",
  "pro",
  "enterprise",
]);

export const botApiKeys = pgTable("bot_api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull(),
  keyHash: text("key_hash").notNull(), // SHA-256 of the raw key
  keyPrefix: text("key_prefix").notNull(), // First 12 chars for identification
  label: text("label"), // "Discord bot", "Telegram bot"
  tier: botApiKeyTierEnum("tier").default("free").notNull(),
  dailyRequestCount: integer("daily_request_count").default(0).notNull(),
  dailyRequestReset: timestamp("daily_request_reset", { withTimezone: true }),
  rateLimit: integer("rate_limit").default(30).notNull(), // req/min, derived from tier
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdById: uuid("created_by_id")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Platform Identities ---

export const platformIdentities = pgTable("platform_identities", {
  id: uuid("id").defaultRandom().primaryKey(),
  platform: text("platform").notNull(), // 'discord', 'telegram', etc.
  platformUserId: text("platform_user_id").notNull(), // Discord snowflake, Telegram ID
  platformUsername: text("platform_username"), // Display name at time of linking
  userId: uuid("user_id").references(() => users.id), // NULL until claimed
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull(),
  unclaimedAttendanceCount: integer("unclaimed_attendance_count").default(0).notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
  linkedAt: timestamp("linked_at", { withTimezone: true }), // When user claimed
}, (table) => [
  unique().on(table.platform, table.platformUserId, table.groupId),
]);

// --- Billing ---

export const communityPlanTierEnum = pgEnum("community_plan_tier", [
  "free",
  "starter",
  "team",
  "organization",
  "league",
]);

export const billingProviderEnum = pgEnum("billing_provider", [
  "stripe",
  "lemonsqueezy",
  "manual",
]);

// Group-level self-pay plan
export const communityPlans = pgTable("community_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  tier: communityPlanTierEnum("tier").default("free").notNull(),
  billingProvider: billingProviderEnum("billing_provider"),
  billingCustomerId: text("billing_customer_id"),
  billingSubscriptionId: text("billing_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Organizations — billing containers that cover groups
export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  tier: communityPlanTierEnum("tier").default("free").notNull(),
  groupQuota: integer("group_quota").default(10).notNull(),
  billingProvider: billingProviderEnum("billing_provider"),
  billingCustomerId: text("billing_customer_id"),
  billingSubscriptionId: text("billing_subscription_id"),
  createdById: uuid("created_by_id")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Org-to-group billing relationship (no permissions — purely financial)
export const orgMemberships = pgTable("org_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull(),
  billingActive: boolean("billing_active").default(true).notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique().on(table.orgId, table.groupId),
]);

// Individual user-level plan
export const userPlans = pgTable("user_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  tier: communityPlanTierEnum("tier").default("free").notNull(),
  billingProvider: billingProviderEnum("billing_provider"),
  billingCustomerId: text("billing_customer_id"),
  billingSubscriptionId: text("billing_subscription_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// --- Voting / Governance ---

export const proposalTypeEnum = pgEnum("proposal_type", [
  "yes_no",
  "multiple_choice",
]);

export const proposalModeEnum = pgEnum("proposal_mode", [
  "quick",
  "formal",
]);

export const proposalStatusEnum = pgEnum("proposal_status", [
  "active",
  "decided",
  "tied",
  "inconclusive",
]);

export const proposals = pgTable("proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull(),
  createdBy: uuid("created_by").references(() => users.id), // NULL for platform-only creators
  createdByPlatformIdentityId: uuid("created_by_platform_identity_id")
    .references(() => platformIdentities.id), // agent or bot user who created it
  title: text("title").notNull(),
  context: text("context"), // optional markdown description
  type: proposalTypeEnum("type").notNull(),
  mode: proposalModeEnum("mode").default("formal").notNull(),
  status: proposalStatusEnum("status").default("active").notNull(),
  votingPeriodHours: integer("voting_period_hours").default(120).notNull(), // 5 days for formal, 24h for quick
  quorum: decimal("quorum", { precision: 3, scale: 2 }), // NULL = no quorum, 0.50 = 50%
  closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
  result: text("result"), // winning option label or summary
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  attestationStatus: text("attestation_status").default("none"), // 'none' | 'pending' | 'confirmed' | 'failed'
  txSignature: text("tx_signature"), // Solana tx signature for vote attestation
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const proposalOptions = pgTable("proposal_options", {
  id: uuid("id").defaultRandom().primaryKey(),
  proposalId: uuid("proposal_id")
    .references(() => proposals.id, { onDelete: "cascade" })
    .notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

export const votes = pgTable("votes", {
  id: uuid("id").defaultRandom().primaryKey(),
  proposalId: uuid("proposal_id")
    .references(() => proposals.id, { onDelete: "cascade" })
    .notNull(),
  optionId: uuid("option_id")
    .references(() => proposalOptions.id)
    .notNull(),
  userId: uuid("user_id").references(() => users.id),
  platformIdentityId: uuid("platform_identity_id")
    .references(() => platformIdentities.id),
  reasoning: text("reasoning"), // agents should always populate this
  castAt: timestamp("cast_at", { withTimezone: true }).defaultNow().notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }), // NULL if never changed
}, (table) => [
  unique().on(table.proposalId, table.userId),
  unique().on(table.proposalId, table.platformIdentityId),
]);

// --- Milestones ---

export const milestoneTypeEnum = pgEnum("milestone_type", [
  "first_activity_3plus",
  "first_active_week",
  "streak_10",
  "streak_25",
]);

export const milestones = pgTable("milestones", {
  id: uuid("id").defaultRandom().primaryKey(),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" })
    .notNull(),
  type: milestoneTypeEnum("type").notNull(),
  earnedAt: timestamp("earned_at", { withTimezone: true }).defaultNow().notNull(),
  cardUrl: text("card_url"),
}, (table) => [
  unique().on(table.groupId, table.type),
]);
