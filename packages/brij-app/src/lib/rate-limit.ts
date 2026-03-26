import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

let publicLimit: Ratelimit | null = null;
let authLimit: Ratelimit | null = null;
let writeLimit: Ratelimit | null = null;
let initialized = false;

function init() {
  if (initialized) return;
  initialized = true;
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return;
    const redis = new Redis({ url, token });
    publicLimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "60 s"), prefix: "rl:pub" });
    authLimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "60 s"), prefix: "rl:auth" });
    writeLimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "60 s"), prefix: "rl:write" });
  } catch {
    // Redis init failed — rate limiting disabled
  }
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Check rate limit. Returns a 429 Response if exceeded, or null if allowed.
 * Call at the top of any API route handler.
 *
 * tier: "public" (20/min by IP), "auth" (60/min by key), "write" (10/min by key)
 */
export async function checkRateLimit(
  req: NextRequest,
  tier: "public" | "auth" | "write",
  key?: string
): Promise<NextResponse | null> {
  init();

  const limiter =
    tier === "public" ? publicLimit :
    tier === "write" ? writeLimit :
    authLimit;

  if (!limiter) return null;

  try {
    const identifier = key || getIp(req);
    const { success } = await limiter.limit(identifier);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  } catch {
    // Fail open
  }

  return null;
}
