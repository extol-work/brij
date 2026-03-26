import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Only initialize if credentials are available
let publicLimit: Ratelimit | null = null;
let authLimit: Ratelimit | null = null;
let writeLimit: Ratelimit | null = null;

try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    publicLimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "60 s"), prefix: "rl:public" });
    authLimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "60 s"), prefix: "rl:auth" });
    writeLimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "60 s"), prefix: "rl:write" });
  }
} catch {
  // Redis init failed — rate limiting disabled
}

const PUBLIC_PATTERNS = ["/api/checkin/", "/api/cards/"];
const WRITE_PATTERNS = ["/api/groups/", "/api/activities"];
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Only rate limit API routes
  if (!path.startsWith("/api/")) return NextResponse.next();

  // Skip cron + auth routes
  if (path.startsWith("/api/cron/") || path.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  // No rate limiter configured — pass through
  if (!publicLimit || !authLimit || !writeLimit) {
    return NextResponse.next();
  }

  // Wrap all Redis calls — never let rate limiting break the app
  try {
    const ip = getClientIp(req);

    // Public endpoints: rate limit by IP
    if (PUBLIC_PATTERNS.some((p) => path.startsWith(p))) {
      const { success } = await publicLimit.limit(ip);
      if (!success) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
      return NextResponse.next();
    }

    // Key by session token if available, otherwise IP
    const sessionToken =
      req.cookies.get("authjs.session-token")?.value ||
      req.cookies.get("__Secure-authjs.session-token")?.value;
    const key = sessionToken ? `user:${sessionToken.slice(0, 16)}` : `ip:${ip}`;

    // Write-heavy: tighter limit
    if (WRITE_METHODS.has(req.method) && WRITE_PATTERNS.some((p) => path.startsWith(p))) {
      const { success } = await writeLimit.limit(key);
      if (!success) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
      }
      return NextResponse.next();
    }

    // All other API routes: standard limit
    const { success } = await authLimit.limit(key);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  } catch {
    // Redis error — fail open (allow the request)
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
