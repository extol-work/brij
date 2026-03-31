/**
 * Test setup — mock external dependencies so route handlers
 * can be tested in isolation without a real DB or Redis.
 */

import { vi } from "vitest";

// Mock Upstash rate limiter — always allow
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    async limit() {
      return { success: true };
    }
  },
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    constructor() {}
  },
}));

// Mock Cortex push — fire and forget, no-op in tests
vi.mock("@/lib/cortex", () => ({
  pushEventClosed: vi.fn().mockResolvedValue(undefined),
}));
