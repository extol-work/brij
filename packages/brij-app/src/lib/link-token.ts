/**
 * Stateless HMAC-signed tokens for platform identity linking.
 *
 * Token format: base64url(JSON payload).base64url(HMAC-SHA256 signature)
 * Payload: { platform, platformUserId, platformUsername, exp }
 * Expiry: 15 minutes
 */

const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

function getSecret(): Uint8Array {
  const secret = process.env.LINK_TOKEN_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("LINK_TOKEN_SECRET or AUTH_SECRET must be set");
  return new TextEncoder().encode(secret);
}

function base64url(buf: ArrayBuffer): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

async function hmacSign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    getSecret() as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload) as BufferSource);
  return base64url(sig);
}

async function hmacVerify(payload: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    getSecret() as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    fromBase64url(signature) as BufferSource,
    new TextEncoder().encode(payload) as BufferSource
  );
}

export interface LinkTokenPayload {
  platform: string;
  platformUserId: string;
  platformUsername: string | null;
  exp: number; // Unix ms
}

/** Create a signed link token for a platform identity. */
export async function createLinkToken(
  platform: string,
  platformUserId: string,
  platformUsername: string | null
): Promise<string> {
  const payload: LinkTokenPayload = {
    platform,
    platformUserId,
    platformUsername,
    exp: Date.now() + TOKEN_EXPIRY_MS,
  };
  const payloadStr = base64url(new TextEncoder().encode(JSON.stringify(payload)).buffer as ArrayBuffer);
  const sig = await hmacSign(payloadStr);
  return `${payloadStr}.${sig}`;
}

/** Verify and decode a link token. Returns null if invalid or expired. */
export async function verifyLinkToken(token: string): Promise<LinkTokenPayload | null> {
  const dotIdx = token.indexOf(".");
  if (dotIdx === -1) return null;

  const payloadStr = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);

  const valid = await hmacVerify(payloadStr, sig);
  if (!valid) return null;

  try {
    const payload: LinkTokenPayload = JSON.parse(
      new TextDecoder().decode(fromBase64url(payloadStr))
    );
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
