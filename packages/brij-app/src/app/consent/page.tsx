"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { track } from "@/lib/posthog";

function ConsentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!agreed) return;
    setSubmitting(true);
    const res = await fetch("/api/consent", { method: "POST" });
    if (res.ok) {
      track("consent_given", { method: "first_checkin" });
      router.push(callbackUrl);
    }
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-bark-900">Welcome to brij</h1>
          <p className="text-warm-gray-500 mt-2">
            Before you get started, we need your agreement.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-warm-gray-200 p-6 shadow-sm">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 w-5 h-5 rounded border-warm-gray-300 text-terracotta-500 focus:ring-terracotta-500 shrink-0"
            />
            <span className="text-sm text-bark-900 leading-relaxed">
              I agree to the{" "}
              <a
                href="https://extol.work/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-terracotta-500 underline"
              >
                Terms of Service
              </a>{" "}
              and{" "}
              <a
                href="https://extol.work/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-terracotta-500 underline"
              >
                Privacy Policy
              </a>
              . I can delete my brij history anytime.
            </span>
          </label>

          <p className="text-xs text-warm-gray-400 mt-4 leading-relaxed">
            brij is built by Extol, Inc. Your data is never sold.{" "}
            <a
              href="https://extol.work/privacy#data-use"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Learn more
            </a>
          </p>

          <button
            onClick={handleSubmit}
            disabled={!agreed || submitting}
            className="w-full mt-6 py-3 bg-terracotta-500 text-cream rounded-xl font-semibold hover:bg-terracotta-600 transition-colors disabled:opacity-50"
          >
            {submitting ? "..." : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConsentPage() {
  return (
    <Suspense>
      <ConsentForm />
    </Suspense>
  );
}
