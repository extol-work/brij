import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { groups, journalEntries } from "@/db/schema";
import { eq, and, gte, lt, isNull, sql } from "drizzle-orm";
import { createHash } from "crypto";

/**
 * GET /api/cron/journal-digest — weekly journal digest
 *
 * Runs Monday 7am UTC via Vercel Cron.
 * Computes a SHA-256 digest of the previous week's journal entries
 * per group, pushes to cortex for on-chain attestation.
 */
export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cortexUrl = process.env.CORTEX_URL;
  const apiKey = process.env.CORTEX_API_KEY;

  // Compute previous week boundaries (Mon-Sun)
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon
  const daysBack = dayOfWeek === 0 ? 7 : dayOfWeek; // days back to most recent Monday
  const periodEnd = new Date(now);
  periodEnd.setUTCDate(now.getUTCDate() - daysBack); // last Monday
  periodEnd.setUTCHours(0, 0, 0, 0);
  const periodStart = new Date(periodEnd);
  periodStart.setUTCDate(periodEnd.getUTCDate() - 7); // Monday before that

  const periodStartStr = periodStart.toISOString().split("T")[0];
  const periodEndStr = periodEnd.toISOString().split("T")[0];

  // Get all groups (not deleted)
  const allGroups = await db
    .select({ id: groups.id })
    .from(groups)
    .where(isNull(groups.deletedAt));

  let digested = 0;
  let skipped = 0;

  for (const group of allGroups) {
    // Get non-deleted entries for this group in the previous week
    const entries = await db
      .select({
        id: journalEntries.id,
        authorId: journalEntries.authorId,
        text: journalEntries.text,
        createdAt: journalEntries.createdAt,
        latitude: journalEntries.latitude,
        longitude: journalEntries.longitude,
      })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.groupId, group.id),
          isNull(journalEntries.deletedAt),
          gte(journalEntries.createdAt, periodStart),
          lt(journalEntries.createdAt, periodEnd)
        )
      )
      .orderBy(journalEntries.id);

    if (entries.length === 0) {
      skipped++;
      continue;
    }

    // Compute per-entry hashes
    const includeGeo = process.env.INCLUDE_GEO_IN_DIGEST === "true";
    const entryHashes = entries.map((e) => {
      let input = `${e.id}${e.authorId}${e.text}${new Date(e.createdAt).toISOString()}`;
      if (includeGeo) {
        input += `${e.latitude ?? "null"}${e.longitude ?? "null"}`;
      }
      return createHash("sha256").update(input).digest("hex");
    });

    // Sort by entry ID (already ordered) and compute digest
    const digest = createHash("sha256")
      .update(entryHashes.join(""))
      .digest("hex");

    const uniqueAuthors = new Set(entries.map((e) => e.authorId)).size;

    // Push to cortex
    if (cortexUrl) {
      try {
        await fetch(`${cortexUrl}/journal-digest`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            communityId: group.id,
            periodStart: periodStartStr,
            periodEnd: periodEndStr,
            entryCount: entries.length,
            uniqueAuthors,
            digest,
          }),
        });
      } catch {
        // Best-effort
      }
    }

    digested++;
  }

  console.log(`[cron:journal-digest] ${digested} digests, ${skipped} skipped (no entries), period ${periodStartStr} to ${periodEndStr}`);

  return NextResponse.json({ digested, skipped, periodStart: periodStartStr, periodEnd: periodEndStr });
}
