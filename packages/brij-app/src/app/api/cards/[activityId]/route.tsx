import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { activities, attendances, users, groups } from "@/db/schema";
import { eq, and, lte, ne, inArray, sql } from "drizzle-orm";
import { selectBackground, getBackgroundUrl, CATEGORY_GRADIENTS, getCategory } from "@/lib/card-backgrounds";
import QRCode from "qrcode";

export const runtime = "nodejs";

// Warm cream — legible on both light and dark backgrounds
const TEXT_COLOR = "#F5E6D0";

// Deterministic avatar colors — diverse warm palette (16 distinct hues)
const AVATAR_COLORS = [
  "#D4956B", "#9B7CB8", "#5B8DB8", "#6B8F71",
  "#D4826B", "#7BAFB8", "#B89BD4", "#C4A84B",
  "#E07B5F", "#5BA88F", "#8B6BBF", "#BF8A5E",
  "#6BAACC", "#A3C25C", "#CC7B9B", "#7BC4A8",
];

// FNV-1a for color selection
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash;
}

function getInitial(name: string | null): string {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

function getAvatarColor(name: string | null): string {
  return AVATAR_COLORS[fnv1a(name ?? "unknown") % AVATAR_COLORS.length];
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ activityId: string }> }
) {
  const { activityId } = await params;

  const activity = await db.query.activities.findFirst({
    where: eq(activities.id, activityId),
  });

  if (!activity) {
    return new Response("Not found", { status: 404 });
  }

  // Get checked-in attendances with user info
  const allAttendances = await db.query.attendances.findMany({
    where: eq(attendances.activityId, activityId),
  });
  const checkedIn = allAttendances.filter((a) => a.status === "checked_in");
  const checkedInCount = checkedIn.length;

  // Fetch user names for registered attendees
  const userIds = checkedIn.map((a) => a.userId).filter(Boolean) as string[];
  const userMap = new Map<string, string>();
  if (userIds.length > 0) {
    const userRows = await Promise.all(
      userIds.map((uid) =>
        db.query.users.findFirst({ where: eq(users.id, uid) })
      )
    );
    for (const u of userRows) {
      if (u) userMap.set(u.id, u.name ?? u.email);
    }
  }

  // Build avatar list: [{name, initial, color}]
  const avatars = checkedIn.map((a) => {
    const name = a.userId ? (userMap.get(a.userId) ?? null) : a.guestName;
    return {
      name,
      initial: getInitial(name),
      color: getAvatarColor(name),
    };
  });

  // --- Streak data ---
  let weekNumber: number | null = null;
  let returningCount = 0;

  if (activity.seriesId) {
    // Series position: count activities in this series up to and including this one
    const seriesCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(activities)
      .where(
        and(
          eq(activities.seriesId, activity.seriesId),
          activity.startsAt
            ? lte(activities.startsAt, activity.startsAt)
            : undefined
        )
      );
    weekNumber = Number(seriesCountResult[0]?.count ?? 0);

    // Returning attendees: checked-in users who also checked into a previous activity in this series
    if (userIds.length > 0 && activity.startsAt) {
      // Get all prior activity IDs in this series
      const priorActivities = await db
        .select({ id: activities.id })
        .from(activities)
        .where(
          and(
            eq(activities.seriesId, activity.seriesId),
            ne(activities.id, activityId),
            lte(activities.startsAt, activity.startsAt)
          )
        );
      const priorIds = priorActivities.map((a) => a.id);

      if (priorIds.length > 0) {
        // Find which of current checked-in users also checked into any prior activity
        const returningUsers = await db
          .select({ userId: attendances.userId })
          .from(attendances)
          .where(
            and(
              inArray(attendances.activityId, priorIds),
              inArray(attendances.userId, userIds),
              eq(attendances.status, "checked_in")
            )
          )
          .groupBy(attendances.userId);
        returningCount = returningUsers.length;
      }
    }
  }

  // Resolve group name
  let groupName: string | null = null;
  if (activity.groupId) {
    const group = await db.query.groups.findFirst({ where: eq(groups.id, activity.groupId) });
    groupName = group?.name || null;
  }

  // Select background — uploaded photo takes priority
  const activityType = activity.activityType ?? null;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "brij.extol.work";
  const baseUrl = `${proto}://${host}`;

  let bgUrl: string;
  let isPhotoBg: boolean;
  let gradientInfo = CATEGORY_GRADIENTS["default"];

  if (activity.photoUrl) {
    // Coordinator-uploaded photo — highest priority
    bgUrl = activity.photoUrl;
    isPhotoBg = true;
  } else {
    const bg = selectBackground(activityId, activityType);
    const category = getCategory(activityType);
    gradientInfo = CATEGORY_GRADIENTS[category] ?? CATEGORY_GRADIENTS["default"];
    bgUrl = getBackgroundUrl(bg.file, baseUrl);
    isPhotoBg = bg.file.endsWith(".jpg") || bg.file.endsWith(".png");
  }

  // Format date
  const dateStr = activity.startsAt
    ? new Date(activity.startsAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  // Flat stat line — hide count when < 4 (Umbriel decision)
  let statLine: string | null;
  if (checkedInCount >= 4) {
    statLine = `${checkedInCount} showed up`;
  } else {
    statLine = null;
  }

  // Streak line: "Week N · M came back"
  const streakParts: string[] = [];
  if (weekNumber && weekNumber > 1) {
    streakParts.push(`Week ${weekNumber}`);
  }
  if (returningCount > 0) {
    streakParts.push(`${returningCount} came back`);
  }
  const streakLine = streakParts.length > 0 ? streakParts.join(" · ") : null;

  // Location + date meta
  const metaParts = [activity.location, dateStr].filter(Boolean);
  const metaLine = metaParts.join(" · ");

  // Truncate title
  const title =
    activity.title.length > 40
      ? activity.title.slice(0, 38) + "…"
      : activity.title;

  // Summary line (from coordinator closure)
  const summaryText = activity.summary
    ? activity.summary.length > 80
      ? activity.summary.slice(0, 78) + "…"
      : activity.summary
    : null;

  // Generate QR code as data URL
  const qrUrl = `https://brij.extol.work/activity/${activityId}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    width: 300,
    margin: 1,
    color: { dark: TEXT_COLOR, light: "#00000000" },
    errorCorrectionLevel: "M",
  });

  // Avatar row: max 8 visible, overflow as "+N"
  const MAX_VISIBLE = 8;
  const overflow = checkedInCount > MAX_VISIBLE ? checkedInCount - 7 : 0;
  const visibleAvatars = overflow > 0 ? avatars.slice(0, 7) : avatars.slice(0, MAX_VISIBLE);
  const AVATAR_SIZE = 80;
  const AVATAR_OVERLAP = 16; // slight overlap — spread out since max 8

  return new ImageResponse(
    (
      <div
        style={{
          width: "1080px",
          height: "1920px",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          fontFamily: "sans-serif",
          color: TEXT_COLOR,
          overflow: "hidden",
          background: isPhotoBg ? "#1a1a1a" : gradientInfo.gradient,
        }}
      >
        {/* Background photo — object-fit cover */}
        {isPhotoBg && (
          <img
            src={bgUrl}
            width={1080}
            height={1920}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "1080px",
              height: "1920px",
              objectFit: "cover",
            }}
          />
        )}

        {/* Vignette — four edge gradients for reliable Satori rendering */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "400px", background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 100%)" }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, width: "1080px", height: "400px", background: "linear-gradient(to top, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 100%)" }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: "300px", height: "1920px", background: "linear-gradient(to right, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 100%)" }} />
        <div style={{ position: "absolute", top: 0, right: 0, width: "300px", height: "1920px", background: "linear-gradient(to left, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 100%)" }} />

        {/* Dark gradient overlay — bottom 60% for text legibility */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "1152px",
            background:
              "linear-gradient(to bottom, transparent 0%, transparent 10%, rgba(0,0,0,0.15) 35%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0.75) 100%)",
          }}
        />

        {/* Header zone */}
        <div
          style={{
            padding: "60px 60px 0",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            zIndex: 1,
          }}
        >
          {groupName && (
            <div
              style={{
                fontSize: "48px",
                fontWeight: 500,
                opacity: 0.7,
                marginBottom: "12px",
                letterSpacing: "0.01em",
              }}
            >
              {groupName}
            </div>
          )}
          <div
            style={{
              fontSize: "108px",
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </div>
          {metaLine && (
            <div
              style={{
                fontSize: "42px",
                fontWeight: 400,
                opacity: 0.7,
                marginTop: "16px",
              }}
            >
              {metaLine}
            </div>
          )}
        </div>

        {/* Spacer — pushes stats to bottom */}
        <div style={{ flex: 1 }} />

        {/* Stats zone */}
        <div
          style={{
            padding: "0 60px",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* Avatar row */}
          {checkedInCount > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginBottom: "24px",
              }}
            >
              {visibleAvatars.map((av, i) => (
                <div
                  key={i}
                  style={{
                    width: `${AVATAR_SIZE}px`,
                    height: `${AVATAR_SIZE}px`,
                    borderRadius: "50%",
                    background: av.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "36px",
                    fontWeight: 700,
                    color: TEXT_COLOR,
                    border: "3px solid rgba(0,0,0,0.3)",
                    marginLeft: i === 0 ? "0" : `-${AVATAR_OVERLAP}px`,
                    zIndex: MAX_VISIBLE - i,
                    position: "relative",
                  }}
                >
                  {av.initial}
                </div>
              ))}
              {overflow > 0 && (
                <div
                  style={{
                    width: `${AVATAR_SIZE}px`,
                    height: `${AVATAR_SIZE}px`,
                    borderRadius: "50%",
                    background: "rgba(80,60,50,0.8)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "28px",
                    fontWeight: 700,
                    color: TEXT_COLOR,
                    border: "3px solid rgba(0,0,0,0.3)",
                    marginLeft: `-${AVATAR_OVERLAP}px`,
                    zIndex: 0,
                    position: "relative",
                  }}
                >
                  +{overflow}
                </div>
              )}
            </div>
          )}

          {statLine && (
            <div
              style={{
                fontSize: "84px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              {statLine}
            </div>
          )}
          {/* EXT-41: Series streak — always show */}
          {streakLine && (
            <div
              style={{
                fontSize: "48px",
                fontWeight: 500,
                opacity: 0.6,
                marginTop: "12px",
                letterSpacing: "-0.01em",
              }}
            >
              {streakLine}
            </div>
          )}
        </div>

        {/* Footer zone — summary wraps alongside QR */}
        <div
          style={{
            padding: "48px 60px 60px",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "40px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            {summaryText && (
              <div
                style={{
                  fontSize: "42px",
                  fontWeight: 400,
                  opacity: 0.65,
                  lineHeight: 1.3,
                  marginBottom: "38px",
                }}
              >
                {summaryText}
              </div>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                fontSize: "52px",
                fontWeight: 500,
                opacity: 0.45,
              }}
            >
              <img
                src={`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#F5E6D0" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>')}`}
                width={40}
                height={40}
              />
              Verified on Solana
            </div>
            <div
              style={{
                fontSize: "36px",
                fontWeight: 500,
                opacity: 0.35,
                letterSpacing: "0.02em",
                marginTop: "4px",
              }}
            >
              brij.extol.work
            </div>
          </div>

          {/* QR code — 243px */}
          <div
            style={{
              width: "243px",
              height: "243px",
              flexShrink: 0,
              background: "rgba(255,255,255,0.12)",
              borderRadius: "22px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "10px",
            }}
          >
            <img
              src={qrDataUrl}
              width={223}
              height={223}
              style={{ borderRadius: "14px" }}
            />
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1920,
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    }
  );
}
