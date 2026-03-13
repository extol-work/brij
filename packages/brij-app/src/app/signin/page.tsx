"use client";

import { signIn } from "next-auth/react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function SignInForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    await signIn("resend", { email, callbackUrl });
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-6">
          <h1 className="text-5xl font-bold text-bark-900">brij</h1>
          <p className="text-lg text-warm-gray-400 font-light">by Extol</p>
        </div>
        <p className="text-lg text-warm-gray-500 text-center mb-6">
          Sign in to join
        </p>

        <button
          onClick={() => signIn("google", { callbackUrl })}
          className="w-full py-3 border border-warm-gray-200 rounded-lg text-bark-900 font-medium hover:border-terracotta-400 transition-colors flex items-center justify-center gap-2 mb-4"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-warm-gray-200" />
          <span className="text-sm text-warm-gray-400">or</span>
          <div className="flex-1 h-px bg-warm-gray-200" />
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className="w-full px-3 py-3 border border-warm-gray-200 rounded-lg focus:outline-none focus:border-terracotta-400"
          />
          <button
            type="submit"
            disabled={sending || !email}
            className="w-full py-3 bg-terracotta-500 text-cream rounded-lg font-medium hover:bg-terracotta-600 transition-colors disabled:opacity-50"
          >
            {sending ? "Sending..." : "Sign in with email"}
          </button>
        </form>

        <p className="text-xs text-warm-gray-400 text-center mt-6">
          We&apos;ll send you a magic link. No password needed.
        </p>
      </div>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
