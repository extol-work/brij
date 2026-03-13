import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { db } from "@/db";
import { activities, attendances } from "@/db/schema";
import { eq } from "drizzle-orm";
import { selectBackground, getBackgroundUrl, CATEGORY_GRADIENTS, getCategory } from "@/lib/card-backgrounds";
import QRCode from "qrcode";

export const runtime = "nodejs";

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

  // Count checked-in attendees
  const allAttendances = await db.query.attendances.findMany({
    where: eq(attendances.activityId, activityId),
  });
  const checkedInCount = allAttendances.filter((a) => a.status === "checked_in").length;

  // Select background
  const activityType = activity.activityType ?? null;
  const bg = selectBackground(activityId, activityType);
  const category = getCategory(activityType);
  const gradientInfo = CATEGORY_GRADIENTS[category] ?? CATEGORY_GRADIENTS["default"];

  // Build base URL for fetching background images
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "brij.extol.work";
  const baseUrl = `${proto}://${host}`;
  const bgUrl = getBackgroundUrl(bg.file, baseUrl);

  // Format date
  const dateStr = activity.startsAt
    ? new Date(activity.startsAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  // Stat line
  const statLine =
    checkedInCount === 0
      ? "No one showed up yet"
      : checkedInCount === 1
        ? "1 person showed up"
        : `${checkedInCount} people showed up`;

  // Location + date meta
  const metaParts = [activity.location, dateStr].filter(Boolean);
  const metaLine = metaParts.join(" · ");

  // Truncate title
  const title =
    activity.title.length > 40
      ? activity.title.slice(0, 38) + "…"
      : activity.title;

  // Is it an SVG (gradient) background?
  const isSvgBg = bg.file.endsWith(".svg");

  // Generate QR code as data URL
  const qrUrl = `https://extol.work/a/${activityId}`;
  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    width: 110,
    margin: 1,
    color: { dark: "#ffffff", light: "#00000000" },
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
          color: "#ffffff",
          overflow: "hidden",
          background: isSvgBg ? gradientInfo.gradient : "#1a1a1a",
        }}
      >
        {/* Background image (photos only) */}
        {!isSvgBg && (
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

        {/* Gradient pattern overlay (SVG backgrounds only) — subtle visual interest */}
        {isSvgBg && (
          <div
            style={{
              position: "absolute",
              top: "500px",
              left: 0,
              right: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: "300px",
                height: "300px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.04)",
              }}
            />
          </div>
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
              fontSize: "72px",
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
            }}
          >
            {title}
          </div>
          {metaLine && (
            <div
              style={{
                fontSize: "28px",
                fontWeight: 400,
                opacity: 0.7,
                marginTop: "12px",
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
              fontSize: "56px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            {statLine}
          </div>
          {/* Streak placeholder — ready for EXT-41 */}
          {/* <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "16px", fontSize: "32px", fontWeight: 600, opacity: 0.8 }}>
            <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: "#a78bfa" }} />
            Week N in a row
          </div> */}
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
                fontSize: "28px",
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
                gap: "10px",
                fontSize: "28px",
                fontWeight: 500,
                opacity: 0.5,
                marginTop: "12px",
              }}
            >
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  border: "3px solid rgba(255,255,255,0.5)",
                }}
              />
              Recorded on brij
            </div>
          </div>

          {/* QR code */}
          <div
            style={{
              width: "110px",
              height: "110px",
              background: "rgba(255,255,255,0.15)",
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "6px",
            }}
          >
            <img
              src={qrDataUrl}
              width={98}
              height={98}
              style={{ borderRadius: "8px" }}
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
