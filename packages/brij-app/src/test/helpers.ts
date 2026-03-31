/**
 * Test helpers — factories for mock data and request builders.
 */

import { NextRequest } from "next/server";
import type { BotContext } from "@/lib/bot-auth";

// --- IDs ---

let counter = 0;
export function fakeUUID(): string {
  counter++;
  return `00000000-0000-0000-0000-${String(counter).padStart(12, "0")}`;
}

export function resetCounter() {
  counter = 0;
}

// --- Mock BotContext ---

export function makeBotContext(overrides?: Partial<BotContext>): BotContext {
  return {
    keyId: fakeUUID(),
    groupId: fakeUUID(),
    group: {
      id: overrides?.groupId || fakeUUID(),
      name: "Test Group",
      memberCount: 10,
      coverImageUrl: null,
      platform: "discord",
      platformGuildId: "123456",
    },
    createdById: fakeUUID(),
    ...overrides,
  };
}

// --- Request builder ---

export function buildRequest(
  method: string,
  url: string,
  body?: unknown,
  headers?: Record<string, string>
): NextRequest {
  const init: RequestInit = {
    method,
    headers: {
      "content-type": "application/json",
      authorization: "Bearer brij_bot_test_key_123",
      ...headers,
    },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new NextRequest(new URL(url, "http://localhost:3000"), init);
}

// --- Response helpers ---

export async function parseJSON(res: Response): Promise<unknown> {
  return res.json();
}

// --- Mock DB ---

export interface MockDB {
  activities: Map<string, Record<string, unknown>>;
  attendances: Map<string, Record<string, unknown>>;
  platformIdentities: Map<string, Record<string, unknown>>;
  groups: Map<string, Record<string, unknown>>;
  botApiKeys: Map<string, Record<string, unknown>>;
  users: Map<string, Record<string, unknown>>;
}

export function createMockDB(): MockDB {
  return {
    activities: new Map(),
    attendances: new Map(),
    platformIdentities: new Map(),
    groups: new Map(),
    botApiKeys: new Map(),
    users: new Map(),
  };
}
