"use client";

import { useSession, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { BrijLogo } from "@/components/brij-logo";

type ClaimResult = {
  linked: number;
  attendances_claimed: number;
  votes_claimed: number;
  platform: string;
  platform_username: string | null;
};

function LinkFlow() {
  const { status } = useSession();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [claiming, setClaiming] = useState(false);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-claim once authenticated
  useEffect(() => {
    if (status !== "authenticated" || !token || claiming || result || error) return;

    setClaiming(true);
    fetch("/api/link/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Failed to link account");
        } else {
          setResult(data);
        }
      })
      .catch(() => setError("Network error — please try again"))
      .finally(() => setClaiming(false));
  }, [status, token, claiming, result, error]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="w-full max-w-sm px-6 text-center">
          <BrijLogo variant="hero" />
          <p className="text-warm-gray-500 mt-4">
            No link token provided. Use the <code className="text-bark-900">/extol link</code> command in Discord to get a link.
          </p>
        </div>
      </div>
    );
  }

  // Not signed in — prompt to sign in
  if (status !== "authenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="w-full max-w-sm px-6 text-center">
          <BrijLogo variant="hero" />
          <h1 className="text-xl font-bold text-bark-900 mt-6 mb-2">
            Connect your account
          </h1>
          <p className="text-warm-gray-500 text-sm mb-6">
            Sign in to link your Discord account to Extol. Your past check-ins and votes will be credited to your profile.
          </p>
          <button
            onClick={() =>
              signIn("google", {
                callbackUrl: `/link?token=${encodeURIComponent(token)}`,
              })
            }
            className="w-full py-3 border border-warm-gray-200 rounded-lg text-bark-900 font-medium hover:border-terracotta-400 transition-colors flex items-center justify-center gap-2 mb-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>
          <button
            onClick={() =>
              signIn("resend", {
                callbackUrl: `/link?token=${encodeURIComponent(token)}`,
              })
            }
            className="w-full py-3 border border-warm-gray-200 rounded-lg text-bark-900 font-medium hover:border-terracotta-400 transition-colors"
          >
            Sign in with email
          </button>
          <p className="text-xs text-warm-gray-400 mt-4">
            Link expires in 15 minutes
          </p>
        </div>
      </div>
    );
  }

  // Claiming in progress
  if (claiming) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="w-full max-w-sm px-6 text-center">
          <BrijLogo variant="hero" />
          <p className="text-warm-gray-500 mt-6">Linking your account...</p>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="w-full max-w-sm px-6 text-center">
          <BrijLogo variant="hero" />
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-800 font-medium">{error}</p>
          </div>
          <Link
            href="/"
            className="inline-block mt-4 text-sm text-violet-600 font-medium"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Success
  if (result) {
    const platformName = result.platform.charAt(0).toUpperCase() + result.platform.slice(1);
    const displayName = result.platform_username || result.platform;

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="w-full max-w-sm px-6 text-center">
          <BrijLogo variant="hero" />
          <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <p className="text-lg font-bold text-emerald-800 mb-1">
              Account linked
            </p>
            <p className="text-sm text-emerald-700">
              {platformName} account <strong>{displayName}</strong> is now connected.
            </p>
          </div>

          {(result.attendances_claimed > 0 || result.votes_claimed > 0) && (
            <div className="mt-4 p-3 bg-white border border-warm-gray-200 rounded-xl text-left">
              <p className="text-xs font-semibold text-warm-gray-500 uppercase tracking-wide mb-2">
                History claimed
              </p>
              {result.attendances_claimed > 0 && (
                <p className="text-sm text-bark-900">
                  {result.attendances_claimed} check-in{result.attendances_claimed !== 1 ? "s" : ""} credited to your profile
                </p>
              )}
              {result.votes_claimed > 0 && (
                <p className="text-sm text-bark-900">
                  {result.votes_claimed} vote{result.votes_claimed !== 1 ? "s" : ""} credited to your profile
                </p>
              )}
            </div>
          )}

          <Link
            href="/"
            className="inline-block mt-6 px-6 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 transition-colors"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return null;
}

export default function LinkPage() {
  return (
    <Suspense>
      <LinkFlow />
    </Suspense>
  );
}
