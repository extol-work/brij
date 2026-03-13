import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { activities, attendances, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { selectBackground, getBackgroundUrl, CATEGORY_GRADIENTS, getCategory } from "@/lib/card-backgrounds";
import QRCode from "qrcode";
// Parse image dimensions from raw bytes (JPEG + PNG)
function parseImageDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG: bytes 16-23 contain width (4 bytes) and height (4 bytes) in the IHDR chunk
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  }
  // JPEG: scan for SOF0/SOF2 markers (0xFF 0xC0 or 0xFF 0xC2)
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length - 9) {
      if (buf[offset] !== 0xff) { offset++; continue; }
      const marker = buf[offset + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        const height = buf.readUInt16BE(offset + 5);
        const width = buf.readUInt16BE(offset + 7);
        return { width, height };
      }
      const len = buf.readUInt16BE(offset + 2);
      offset += 2 + len;
    }
  }
  return null;
}

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

  // Compute cover-crop dimensions for photo backgrounds
  // Satori doesn't reliably support objectPosition or backgroundSize, so we
  // manually scale + offset the <img> to simulate object-fit: cover / center.
  let imgStyle: Record<string, string | number> | null = null;
  let debugInfo = "no-photo";
  if (isPhotoBg) {
    try {
      const res = await fetch(bgUrl);
      const buf = Buffer.from(await res.arrayBuffer());
      debugInfo = `fetched:${buf.length}bytes,first4:${buf[0]?.toString(16)}-${buf[1]?.toString(16)}-${buf[2]?.toString(16)}-${buf[3]?.toString(16)}`;
      const dims = parseImageDimensions(buf);
      if (dims) {
        const { width: imgW, height: imgH } = dims;
        debugInfo += `,dims:${imgW}x${imgH}`;
        const CARD_W = 1080;
        const CARD_H = 1920;
        const scaleX = CARD_W / imgW;
        const scaleY = CARD_H / imgH;
        const scale = Math.max(scaleX, scaleY); // cover
        const renderW = Math.round(imgW * scale);
        const renderH = Math.round(imgH * scale);
        const offsetX = Math.round((CARD_W - renderW) / 2);
        const offsetY = Math.round((CARD_H - renderH) / 2);
        debugInfo += `,render:${renderW}x${renderH},offset:${offsetX},${offsetY}`;
        imgStyle = {
          position: "absolute",
          top: `${offsetY}px`,
          left: `${offsetX}px`,
          width: `${renderW}px`,
          height: `${renderH}px`,
        };
      } else {
        debugInfo += ",parse-failed";
      }
    } catch (e: unknown) {
      debugInfo = `error:${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // Format date
  const dateStr = activity.startsAt
    ? new Date(activity.startsAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  // Flat stat line — no personalization
  let statLine: string;
  if (checkedInCount === 0) {
    statLine = "No one showed up yet";
  } else if (checkedInCount === 1) {
    statLine = "1 showed up";
  } else {
    statLine = `${checkedInCount} showed up`;
  }

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
        {/* Background image — manually positioned to simulate cover + center crop */}
        {isPhotoBg && (
          <img
            src={bgUrl}
            style={imgStyle ?? {
              position: "absolute",
              top: 0,
              left: 0,
              width: "1080px",
              height: "1920px",
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

          <div
            style={{
              fontSize: "84px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {statLine}
          </div>
          {/* Streak placeholder — ready for EXT-41 */}
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
                  marginBottom: "48px",
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
                opacity: 0.6,
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  border: `4px solid ${TEXT_COLOR}80`,
                }}
              />
              Recorded on brij
            </div>
            <div
              style={{
                fontSize: "42px",
                fontWeight: 500,
                opacity: 0.45,
                letterSpacing: "0.02em",
                marginTop: "4px",
              }}
            >
              extol.work
            </div>
          </div>

          {/* QR code — 300px for reliable camera scanning */}
          <div
            style={{
              width: "300px",
              height: "300px",
              flexShrink: 0,
              background: "rgba(255,255,255,0.12)",
              borderRadius: "28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "14px",
            }}
          >
            <img
              src={qrDataUrl}
              width={272}
              height={272}
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
        "X-Card-Debug": debugInfo,
      },
    }
  );
}
