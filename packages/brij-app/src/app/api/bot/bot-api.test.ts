/**
 * Bot API endpoint tests.
 *
 * Tests all 6 bot API endpoints + auth middleware.
 * Mocks DB and auth layer to test route handler logic in isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { buildRequest, makeBotContext, fakeUUID, resetCounter } from "@/test/helpers";
import type { BotContext } from "@/lib/bot-auth";

// ─── Shared mocks ───────────────────────────────────────────────────

let mockAuth: BotContext | NextResponse;
vi.mock("@/lib/bot-auth", () => ({
  authenticateBot: vi.fn(() => Promise.resolve(mockAuth)),
}));

// Mock DB with controllable returns
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockInsertReturning = vi.fn();
const mockUpdate = vi.fn();
const mockSelectFrom = vi.fn();

vi.mock("@/db", () => ({
  db: {
    query: {
      activities: { findFirst: (...args: unknown[]) => mockFindFirst("activities", ...args) },
      attendances: { findFirst: (...args: unknown[]) => mockFindFirst("attendances", ...args), findMany: (...args: unknown[]) => mockFindMany("attendances", ...args) },
      platformIdentities: { findFirst: (...args: unknown[]) => mockFindFirst("platformIdentities", ...args) },
      groups: { findFirst: (...args: unknown[]) => mockFindFirst("groups", ...args) },
      users: { findFirst: (...args: unknown[]) => mockFindFirst("users", ...args) },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: () => mockInsertReturning(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: () => mockUpdate(),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: () => mockSelectFrom(),
      })),
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  activities: { id: "id", groupId: "group_id", platformEventId: "platform_event_id", status: "status" },
  attendances: { activityId: "activity_id", status: "status", platformIdentityId: "platform_identity_id" },
  platformIdentities: { id: "id", platform: "platform", platformUserId: "platform_user_id", groupId: "group_id" },
  groups: { id: "id" },
  botApiKeys: {},
  groupMemberships: {},
  users: { id: "id" },
}));

vi.mock("@/lib/share-code", () => ({
  generateShareCode: () => "abc123",
}));

vi.mock("@/lib/validate", () => ({
  validateText: () => null,
  truncate: (v: string) => v,
  limits: { MAX_TITLE: 200, MAX_DESCRIPTION: 2000 },
}));

vi.mock("@/lib/event-close", () => ({
  pushActivityClosed: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
}));

// Drizzle operators — just passthrough
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  sql: vi.fn(),
}));

// ─── Helpers ────────────────────────────────────────────────────────

let defaultCtx: BotContext;

beforeEach(() => {
  vi.clearAllMocks();
  resetCounter();
  defaultCtx = makeBotContext();
  mockAuth = defaultCtx;
});

// ─── Auth Tests ─────────────────────────────────────────────────────

describe("Bot Auth", () => {
  it("returns 401 when auth fails", async () => {
    mockAuth = NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { POST } = await import("./activities/route");
    const req = buildRequest("POST", "/api/bot/activities", { title: "Test", duration_minutes: 30 });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("returns 429 when rate limited", async () => {
    mockAuth = NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const { POST } = await import("./activities/route");
    const req = buildRequest("POST", "/api/bot/activities", { title: "Test", duration_minutes: 30 });
    const res = await POST(req);

    expect(res.status).toBe(429);
  });
});

// ─── POST /bot/activities ───────────────────────────────────────────

describe("POST /bot/activities", () => {
  it("creates an activity with valid input", async () => {
    const activityId = fakeUUID();
    mockFindFirst.mockResolvedValue(null); // no duplicate platform_event_id
    mockInsertReturning.mockResolvedValue([{
      id: activityId,
      title: "Weekly Standup",
      shareCode: "abc123",
      startsAt: new Date("2026-03-30T10:00:00Z"),
      endsAt: new Date("2026-03-30T10:30:00Z"),
      status: "open",
      cardUrl: null,
    }]);

    const { POST } = await import("./activities/route");
    const req = buildRequest("POST", "/api/bot/activities", {
      title: "Weekly Standup",
      duration_minutes: 30,
      platform_event_id: "discord_evt_123",
    });
    const res = await POST(req);
    const data = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(201);
    expect(data.id).toBe(activityId);
    expect(data.share_code).toBe("abc123");
    expect(data.status).toBe("open");
  });

  it("rejects missing title", async () => {
    const { POST } = await import("./activities/route");
    const req = buildRequest("POST", "/api/bot/activities", { duration_minutes: 30 });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, string>;
    expect(data.error).toContain("title");
  });

  it("rejects invalid duration", async () => {
    const { POST } = await import("./activities/route");
    const req = buildRequest("POST", "/api/bot/activities", {
      title: "Test",
      duration_minutes: 0,
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, string>;
    expect(data.error).toContain("duration_minutes");
  });

  it("rejects duration over 1440", async () => {
    const { POST } = await import("./activities/route");
    const req = buildRequest("POST", "/api/bot/activities", {
      title: "Test",
      duration_minutes: 1441,
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("returns 409 on duplicate platform_event_id", async () => {
    mockFindFirst.mockResolvedValue({ id: fakeUUID() }); // existing activity

    const { POST } = await import("./activities/route");
    const req = buildRequest("POST", "/api/bot/activities", {
      title: "Duplicate",
      duration_minutes: 30,
      platform_event_id: "discord_evt_123",
    });
    const res = await POST(req);

    expect(res.status).toBe(409);
  });
});

// ─── GET /bot/activities/[id] ───────────────────────────────────────

describe("GET /bot/activities/[id]", () => {
  it("returns activity details with attendee count", async () => {
    const activityId = fakeUUID();
    mockFindFirst.mockResolvedValue({
      id: activityId,
      title: "Jam Session",
      status: "open",
      startsAt: new Date("2026-03-30T10:00:00Z"),
      endsAt: new Date("2026-03-30T11:00:00Z"),
      cardUrl: "https://example.com/card.png",
      shareCode: "abc123",
    });
    mockSelectFrom.mockResolvedValue([{ count: 5 }]);

    const { GET } = await import("./activities/[id]/route");
    const req = buildRequest("GET", "/api/bot/activities/" + activityId);
    const res = await GET(req, { params: Promise.resolve({ id: activityId }) });
    const data = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(data.id).toBe(activityId);
    expect(data.attendee_count).toBe(5);
    expect(data.share_code).toBe("abc123");
  });

  it("returns 404 for non-existent activity", async () => {
    mockFindFirst.mockResolvedValue(null);

    const { GET } = await import("./activities/[id]/route");
    const req = buildRequest("GET", "/api/bot/activities/nonexistent");
    const res = await GET(req, { params: Promise.resolve({ id: "nonexistent" }) });

    expect(res.status).toBe(404);
  });
});

// ─── POST /bot/activities/[id]/checkin ──────────────────────────────

describe("POST /bot/activities/[id]/checkin", () => {
  const activityId = "act-001";

  it("checks in attendees successfully", async () => {
    // Activity exists and is open
    mockFindFirst.mockImplementation((table: string) => {
      if (table === "activities") return Promise.resolve({ id: activityId, status: "open", groupId: defaultCtx.groupId });
      if (table === "platformIdentities") return Promise.resolve(null); // new identity
      if (table === "attendances") return Promise.resolve(null); // not already checked in
      return Promise.resolve(null);
    });
    mockInsertReturning.mockResolvedValue([{
      id: fakeUUID(),
      platform: "discord",
      platformUserId: "111",
      platformUsername: "alice",
      groupId: defaultCtx.groupId,
      userId: null,
      unclaimedAttendanceCount: 0,
    }]);
    mockUpdate.mockResolvedValue(undefined);

    const { POST } = await import("./activities/[id]/checkin/route");
    const req = buildRequest("POST", `/api/bot/activities/${activityId}/checkin`, {
      attendees: [
        { platform_user_id: "discord:111", display_name: "alice" },
        { platform_user_id: "discord:222", display_name: "bob" },
      ],
    });
    const res = await POST(req, { params: Promise.resolve({ id: activityId }) });
    const data = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(data.activity_id).toBe(activityId);
    expect(typeof data.checked_in).toBe("number");
  });

  it("rejects empty attendees array", async () => {
    const { POST } = await import("./activities/[id]/checkin/route");
    const req = buildRequest("POST", `/api/bot/activities/${activityId}/checkin`, {
      attendees: [],
    });
    const res = await POST(req, { params: Promise.resolve({ id: activityId }) });

    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, string>;
    expect(data.error).toContain("attendees");
  });

  it("rejects batch exceeding group member count cap", async () => {
    // Group has 5 members — batch of 10 should be rejected
    const ctx = makeBotContext();
    ctx.group.memberCount = 5;
    mockAuth = ctx;

    const { POST } = await import("./activities/[id]/checkin/route");
    const attendees = Array.from({ length: 10 }, (_, i) => ({
      platform_user_id: `discord:${i}`,
      display_name: `user${i}`,
    }));
    const req = buildRequest("POST", `/api/bot/activities/${activityId}/checkin`, { attendees });
    const res = await POST(req, { params: Promise.resolve({ id: activityId }) });

    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, string>;
    expect(data.error).toContain("exceeds maximum");
  });

  it("enforces hard batch ceiling of 200", async () => {
    const ctx = makeBotContext();
    ctx.group.memberCount = 500; // large group
    mockAuth = ctx;

    const { POST } = await import("./activities/[id]/checkin/route");
    const attendees = Array.from({ length: 201 }, (_, i) => ({
      platform_user_id: `discord:${i}`,
      display_name: `user${i}`,
    }));
    const req = buildRequest("POST", `/api/bot/activities/${activityId}/checkin`, { attendees });
    const res = await POST(req, { params: Promise.resolve({ id: activityId }) });

    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, string>;
    expect(data.error).toContain("200");
  });

  it("rejects checkin on closed activity", async () => {
    mockFindFirst.mockImplementation((table: string) => {
      if (table === "activities") return Promise.resolve({ id: activityId, status: "closed", groupId: defaultCtx.groupId });
      return Promise.resolve(null);
    });

    const { POST } = await import("./activities/[id]/checkin/route");
    const req = buildRequest("POST", `/api/bot/activities/${activityId}/checkin`, {
      attendees: [{ platform_user_id: "discord:111", display_name: "alice" }],
    });
    const res = await POST(req, { params: Promise.resolve({ id: activityId }) });

    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, string>;
    expect(data.error).toContain("closed");
  });

  it("returns 404 for non-existent activity", async () => {
    mockFindFirst.mockResolvedValue(null);

    const { POST } = await import("./activities/[id]/checkin/route");
    const req = buildRequest("POST", `/api/bot/activities/${activityId}/checkin`, {
      attendees: [{ platform_user_id: "discord:111", display_name: "alice" }],
    });
    const res = await POST(req, { params: Promise.resolve({ id: activityId }) });

    expect(res.status).toBe(404);
  });

  it("skips attendees at unclaimed attendance cap", async () => {
    mockFindFirst.mockImplementation((table: string) => {
      if (table === "activities") return Promise.resolve({ id: activityId, status: "open", groupId: defaultCtx.groupId });
      if (table === "platformIdentities") return Promise.resolve({
        id: fakeUUID(),
        platform: "discord",
        platformUserId: "999",
        platformUsername: "spammer",
        groupId: defaultCtx.groupId,
        userId: null, // unclaimed
        unclaimedAttendanceCount: 50, // at cap
      });
      if (table === "attendances") return Promise.resolve(null); // not already checked in
      return Promise.resolve(null);
    });

    const { POST } = await import("./activities/[id]/checkin/route");
    const req = buildRequest("POST", `/api/bot/activities/${activityId}/checkin`, {
      attendees: [{ platform_user_id: "discord:999", display_name: "spammer" }],
    });
    const res = await POST(req, { params: Promise.resolve({ id: activityId }) });
    const data = await res.json() as Record<string, number>;

    expect(res.status).toBe(200);
    expect(data.skipped_cap_reached).toBe(1);
    expect(data.checked_in).toBe(0);
  });

  it("skips invalid platform_user_id formats", async () => {
    mockFindFirst.mockImplementation((table: string) => {
      if (table === "activities") return Promise.resolve({ id: activityId, status: "open", groupId: defaultCtx.groupId });
      return Promise.resolve(null);
    });

    const { POST } = await import("./activities/[id]/checkin/route");
    const req = buildRequest("POST", `/api/bot/activities/${activityId}/checkin`, {
      attendees: [
        { platform_user_id: "nocolon", display_name: "bad" },
        { platform_user_id: ":empty", display_name: "bad2" },
        { platform_user_id: "empty:", display_name: "bad3" },
      ],
    });
    const res = await POST(req, { params: Promise.resolve({ id: activityId }) });
    const data = await res.json() as Record<string, number>;

    expect(res.status).toBe(200);
    expect(data.checked_in).toBe(0);
  });
});

// ─── POST /bot/activities/[id]/close ────────────────────────────────

describe("POST /bot/activities/[id]/close", () => {
  it("closes an open activity", async () => {
    const activityId = fakeUUID();
    mockFindFirst.mockResolvedValue({
      id: activityId,
      status: "open",
      groupId: defaultCtx.groupId,
      summary: null,
      sentiment: null,
      cardUrl: "https://example.com/card.png",
    });
    mockUpdate.mockResolvedValue(undefined);
    mockSelectFrom.mockResolvedValue([{ count: 3 }]);

    const { POST } = await import("./activities/[id]/close/route");
    const req = buildRequest("POST", `/api/bot/activities/${activityId}/close`, {
      summary: "Great session",
      sentiment: "positive",
    });
    const res = await POST(req, { params: Promise.resolve({ id: activityId }) });
    const data = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(data.status).toBe("closed");
    expect(data.attendee_count).toBe(3);
    expect(data.id).toBe(activityId);
  });

  it("rejects closing an already closed activity", async () => {
    mockFindFirst.mockResolvedValue({ id: fakeUUID(), status: "closed", groupId: defaultCtx.groupId });

    const { POST } = await import("./activities/[id]/close/route");
    const req = buildRequest("POST", `/api/bot/activities/${fakeUUID()}/close`);
    const res = await POST(req, { params: Promise.resolve({ id: fakeUUID() }) });

    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, string>;
    expect(data.error).toContain("already closed");
  });

  it("returns 404 for non-existent activity", async () => {
    mockFindFirst.mockResolvedValue(null);

    const { POST } = await import("./activities/[id]/close/route");
    const req = buildRequest("POST", `/api/bot/activities/bad-id/close`);
    const res = await POST(req, { params: Promise.resolve({ id: "bad-id" }) });

    expect(res.status).toBe(404);
  });
});

// ─── GET /bot/card/[activityId] ─────────────────────────────────────

describe("GET /bot/card/[activityId]", () => {
  it("returns card embed data", async () => {
    const activityId = fakeUUID();
    mockFindFirst.mockResolvedValue({
      id: activityId,
      title: "Team Meetup",
      status: "closed",
      startsAt: new Date("2026-03-30T10:00:00Z"),
      cardUrl: "https://example.com/card.png",
      groupId: defaultCtx.groupId,
    });
    mockSelectFrom.mockResolvedValue([{ count: 8 }]);

    const { GET } = await import("./card/[activityId]/route");
    const req = buildRequest("GET", `/api/bot/card/${activityId}`);
    const res = await GET(req, { params: Promise.resolve({ activityId }) });
    const data = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(data.title).toBe("Team Meetup");
    expect(data.group_name).toBe("Test Group");
    expect(data.attendee_count).toBe(8);
    expect(data.verified).toBe(true);
    expect(data.card_page).toContain(activityId);
  });

  it("returns 404 for non-existent activity", async () => {
    mockFindFirst.mockResolvedValue(null);

    const { GET } = await import("./card/[activityId]/route");
    const req = buildRequest("GET", "/api/bot/card/bad-id");
    const res = await GET(req, { params: Promise.resolve({ activityId: "bad-id" }) });

    expect(res.status).toBe(404);
  });
});

// ─── GET /bot/group ─────────────────────────────────────────────────

describe("GET /bot/group", () => {
  it("returns group info with activity count", async () => {
    mockSelectFrom.mockResolvedValue([{ count: 12 }]);

    const { GET } = await import("./group/route");
    const req = buildRequest("GET", "/api/bot/group");
    const res = await GET(req);
    const data = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(data.name).toBe("Test Group");
    expect(data.member_count).toBe(10);
    expect(data.activity_count).toBe(12);
    expect(data.platform).toBe("discord");
    expect(typeof data.join_url).toBe("string");
  });
});
