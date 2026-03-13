import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { activities, attendances, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { selectBackground, getBackgroundUrl, CATEGORY_GRADIENTS, getCategory } from "@/lib/card-backgrounds";
import { getAuthUser } from "@/lib/auth";
import QRCode from "qrcode";

export const runtime = "nodejs";

// Warm cream — legible on both light and dark backgrounds
const TEXT_COLOR = "#F5E6D0";

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

  // Get current user for personalization
  const currentUser = await getAuthUser().catch(() => null);
  const userId = currentUser?.id ?? null;

  // Count checked-in attendees
  const allAttendances = await db.query.attendances.findMany({
    where: eq(attendances.activityId, activityId),
  });
  const checkedInCount = allAttendances.filter((a) => a.status === "checked_in").length;

  // Check if current user is an attendee
  const isAttendee = userId
    ? allAttendances.some((a) => a.userId === userId && a.status === "checked_in")
    : false;

  // Select background — userId varies the image per person
  const activityType = activity.activityType ?? null;
  const bg = selectBackground(activityId, activityType, userId);
  const category = getCategory(activityType);
  const gradientInfo = CATEGORY_GRADIENTS[category] ?? CATEGORY_GRADIENTS["default"];

  // Build base URL for fetching background images
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "brij.extol.work";
  const baseUrl = `${proto}://${host}`;
  const bgUrl = getBackgroundUrl(bg.file, baseUrl);

  // Photo backgrounds load as images; SVGs use CSS gradient fallback
  const isPhotoBg = bg.file.endsWith(".jpg") || bg.file.endsWith(".png");

  // Format date
  const dateStr = activity.startsAt
    ? new Date(activity.startsAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  // Personalized stat line (EXT-46)
  let statLine: string;
  if (checkedInCount === 0) {
    statLine = "No one showed up yet";
  } else if (isAttendee) {
    const others = checkedInCount - 1;
    if (others === 0) {
      statLine = "You showed up";
    } else if (others === 1) {
      statLine = "You + 1 other showed up";
    } else {
      statLine = `You + ${Math.min(others, 99)} others showed up`;
    }
  } else {
    statLine =
      checkedInCount === 1
        ? "1 person showed up"
        : `${checkedInCount} people showed up`;
  }

  // Location + date meta
  const metaParts = [activity.location, dateStr].filter(Boolean);
  const metaLine = metaParts.join(" · ");

  // Truncate title
  const title =
    activity.title.length > 40
      ? activity.title.slice(0, 38) + "…"
      : activity.title;

  // Generate QR code as data URL
  const qrUrl = `https://extol.work/a/${activityId}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    width: 156,
    margin: 1,
    color: { dark: TEXT_COLOR, light: "#00000000" },
    errorCorrectionLevel: "M",
  });

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
        {/* Background image */}
        {isPhotoBg && (
          <img
            src={bgUrl}
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

        {/* Footer zone */}
        <div
          style={{
            padding: "48px 60px 60px",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: "42px",
                fontWeight: 500,
                opacity: 0.45,
                letterSpacing: "0.02em",
              }}
            >
              extol.work
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                fontSize: "42px",
                fontWeight: 500,
                opacity: 0.5,
                marginTop: "16px",
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  border: `4px solid ${TEXT_COLOR}80`,
                }}
              />
              Recorded on brij
            </div>
          </div>

          {/* QR code — 156px (200% area from 110px) */}
          <div
            style={{
              width: "156px",
              height: "156px",
              background: "rgba(255,255,255,0.12)",
              borderRadius: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "8px",
            }}
          >
            <img
              src={qrDataUrl}
              width={140}
              height={140}
              style={{ borderRadius: "10px" }}
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
