import { NextRequest, NextResponse } from "next/server";
import { authenticateBot } from "@/lib/bot-auth";
import { createLinkToken } from "@/lib/link-token";

/**
 * POST /api/bot/link-token
 *
 * Bot requests a link token so a platform user can claim their identity.
 * Returns a URL the bot should DM to the user.
 *
 * Body: { platform_user_id: "discord:123456789", display_name?: "alice" }
 * Response: { link_url: "https://brij.extol.work/link?token=xxx", expires_in: 900 }
 */
export async function POST(req: NextRequest) {
  const auth = await authenticateBot(req, "write");
  if (auth instanceof NextResponse) return auth;

  const body = await req.json();
  const { platform_user_id, display_name } = body;

  if (!platform_user_id || typeof platform_user_id !== "string") {
    return NextResponse.json(
      { error: "platform_user_id required (format: 'discord:123456789')" },
      { status: 400 }
    );
  }

  const colonIdx = platform_user_id.indexOf(":");
  if (colonIdx === -1) {
    return NextResponse.json(
      { error: "platform_user_id must be 'platform:id' format" },
      { status: 400 }
    );
  }

  const platform = platform_user_id.slice(0, colonIdx);
  const platformUserId = platform_user_id.slice(colonIdx + 1);

  if (!platform || !platformUserId) {
    return NextResponse.json(
      { error: "platform_user_id must be 'platform:id' format" },
      { status: 400 }
    );
  }

  const token = await createLinkToken(platform, platformUserId, display_name || null);

  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "https://brij.extol.work";
  const linkUrl = `${baseUrl}/link?token=${encodeURIComponent(token)}`;

  return NextResponse.json({
    link_url: linkUrl,
    expires_in: 900, // 15 minutes in seconds
  });
}
