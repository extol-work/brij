import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Only initialize if credentials are available (skip in dev if not set)
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// Tier 1: Public endpoints — 20 req/min per IP
const publicLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(20, "60 s"), prefix: "rl:public" })
  : null;

// Tier 2: Authenticated endpoints — 60 req/min per user
const authLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "60 s"), prefix: "rl:auth" })
  : null;

// Tier 3: Write-heavy endpoints — 10 req/min per user
const writeLimit = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "60 s"), prefix: "rl:write" })
  : null;

// Route classification
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

function isPublicRoute(path: string): boolean {
  return PUBLIC_PATTERNS.some((p) => path.startsWith(p));
}

function isWriteRoute(path: string, method: string): boolean {
  if (!WRITE_METHODS.has(method)) return false;
  return WRITE_PATTERNS.some((p) => path.startsWith(p));
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Only rate limit API routes
  if (!path.startsWith("/api/")) return NextResponse.next();

  // Skip cron routes (protected by CRON_SECRET, not rate limiting)
  if (path.startsWith("/api/cron/")) return NextResponse.next();

  // Skip auth routes (NextAuth needs to work freely)
  if (path.startsWith("/api/auth/")) return NextResponse.next();

  // If Redis not configured, skip rate limiting (dev mode)
  if (!redis) return NextResponse.next();

  const ip = getClientIp(req);

  // Public endpoints: rate limit by IP
  if (isPublicRoute(path) && publicLimit) {
    const { success, limit, remaining, reset } = await publicLimit.limit(ip);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          },
        }
      );
    }
    return NextResponse.next();
  }

  // Authenticated endpoints: get session token from cookie for keying
  const sessionToken =
    req.cookies.get("authjs.session-token")?.value ||
    req.cookies.get("__Secure-authjs.session-token")?.value;
  const key = sessionToken ? `user:${sessionToken.slice(0, 16)}` : `ip:${ip}`;

  // Write-heavy endpoints: tighter limit
  if (isWriteRoute(path, req.method) && writeLimit) {
    const { success, limit, remaining, reset } = await writeLimit.limit(key);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests — slow down" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          },
        }
      );
    }
    return NextResponse.next();
  }

  // All other authenticated API routes: standard limit
  if (authLimit) {
    const { success, limit, remaining, reset } = await authLimit.limit(key);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          },
        }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
