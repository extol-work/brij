"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import { firstName, initial } from "@/lib/names";

interface Attendee {
  name: string;
  isGuest: boolean;
  status: "coming" | "checked_in";
}

interface ActivityInfo {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  attendees: Attendee[];
}

function formatDateTime(startsAt: string | null) {
  if (!startsAt) return null;
  const d = new Date(startsAt);
  const date = d.toLocaleDateString();
  const hours = d.getHours();
  const mins = d.getMinutes();
  if (hours === 0 && mins === 0) return date;
  return `${date} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function isLive(startsAt: string | null, endsAt: string | null): boolean {
  if (!startsAt) return false;
  const start = new Date(startsAt).getTime();
  const now = Date.now();
  if (endsAt) {
    const end = new Date(endsAt).getTime();
    return now >= start && now <= end;
  }
  const hourBefore = start - 60 * 60 * 1000;
  const fourHoursAfter = start + 4 * 60 * 60 * 1000;
  return now >= hourBefore && now <= fourHoursAfter;
}

export default function JoinActivity() {
  const { code } = useParams<{ code: string }>();
  const { status: sessionStatus } = useSession();
  const authenticated = sessionStatus === "authenticated";
  const [activity, setActivity] = useState<ActivityInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/checkin/${code}`)
      .then((r) => {
        if (!r.ok) throw new Error("Activity not found");
        return r.json();
      })
      .then(setActivity)
      .catch(() => setError("This activity doesn't exist or is no longer open."));
  }, [code]);

  async function handleAction(asGuest: boolean) {
    setSubmitting(true);
    const live = activity ? isLive(activity.startsAt, activity.endsAt) : false;
    const body = {
      ...(asGuest ? { guestName } : {}),
      ...(live ? { checkin: true } : {}),
    };

    const res = await fetch(`/api/checkin/${code}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setSubmitted(true);
    } else {
      const data = await res.json();
      setError(data.error || "Something went wrong");
    }
    setSubmitting(false);
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-warm-gray-500">{error}</p>
      </div>
    );
  }

  if (!activity) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-warm-gray-500">Loading...</p>
      </div>
    );
  }

  const live = isLive(activity.startsAt, activity.endsAt);

  if (submitted) {
    const coming = activity.attendees.filter((a) => a.status === "coming");
    const checkedIn = activity.attendees.filter((a) => a.status === "checked_in");
    return (
      <div className="min-h-screen">
        <header className="border-b border-warm-gray-200">
          <div className="max-w-md mx-auto px-6 py-4">
            <span className="text-2xl font-bold text-bark-900">brij</span><span className="text-base text-warm-gray-400 font-light ml-1.5">by Extol</span>
          </div>
        </header>
        <div className="flex items-center justify-center" style={{ minHeight: "calc(100vh - 65px)" }}>
          <div className="text-center max-w-md px-6">
            {live ? (
              <>
                <h1 className="text-2xl font-bold text-bark-900 mb-1">
                  You&apos;re checked in!
                </h1>
                <p className="text-sm text-warm-gray-500 mb-4">
                  {activity.title} · {new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </p>
                <div className="mx-auto w-[160px] h-[160px] rounded-full bg-green-600 text-white flex items-center justify-center text-5xl font-bold shadow-[0_4px_20px_rgba(22,163,74,0.3)]">
                  ✓
                </div>
              </>
            ) : (
              <>
                <div className="text-4xl mb-4">✓</div>
                <h1 className="text-2xl font-semibold text-bark-900 mb-2">
                  You&apos;re coming!
                </h1>
                <p className="text-warm-gray-500">
                  {coming.length + 1} {coming.length === 0 ? "person" : "people"} planning to attend <strong>{activity.title}</strong>.
                </p>
              </>
            )}
            {live && (
              <div className="mt-6">
                <p className="text-sm font-medium text-warm-gray-500 uppercase tracking-wide mb-3">Here today:</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {checkedIn.map((a, i) => (
                    <span key={i} className="w-11 h-11 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-lg font-semibold">
                      {initial(a.name)}
                    </span>
                  ))}
                  <span className="w-11 h-11 rounded-full bg-green-600 text-white flex items-center justify-center text-lg font-semibold">
                    ✓
                  </span>
                </div>
              </div>
            )}
            {authenticated ? (
              <Link
                href="/"
                className="inline-block mt-6 px-4 py-2 border border-warm-gray-200 rounded-lg text-bark-900 text-sm font-medium hover:border-terracotta-400 transition-colors"
              >
                Go to dashboard
              </Link>
            ) : (
              <div className="mt-6 space-y-3">
                <button
                  onClick={() => signIn(undefined, { callbackUrl: `/join/${code}` })}
                  className="px-6 py-2 bg-terracotta-500 text-cream rounded-lg text-sm font-medium hover:bg-terracotta-600 transition-colors"
                >
                  Sign in to keep a full record
                </button>
                <p className="text-xs text-warm-gray-400">
                  Your attendance will be linked to your account.
                </p>
              </div>
            )}
            <p className="mt-4 text-sm text-warm-gray-400">
              {live ? (
                <>Recorded on Brij.</>
              ) : (
                <>Want to organize your own?{" "}
                  <a href="https://brij.extol.work" className="text-terracotta-500 hover:underline">
                    Learn about Brij
                  </a>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const formatted = formatDateTime(activity.startsAt);
  const coming = activity.attendees.filter((a) => a.status === "coming");
  const checkedIn = activity.attendees.filter((a) => a.status === "checked_in");

  return (
    <div className="min-h-screen">
      <header className="border-b border-warm-gray-200">
        <div className="max-w-md mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-2xl font-bold text-bark-900">brij</span><span className="text-base text-warm-gray-400 font-light ml-1.5">by Extol</span>
          {live && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full uppercase tracking-wide">
              <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />
              Live
            </span>
          )}
        </div>
      </header>
      <div className="max-w-md w-full mx-auto px-6 py-8">
        {authenticated && (
          <Link
            href="/"
            className="text-sm text-warm-gray-500 hover:text-bark-900 mb-6 block"
          >
            &larr; Dashboard
          </Link>
        )}

        {live ? (
          <div className="text-center py-4">
            <p className="text-base text-warm-gray-500 mb-1">{activity.location}</p>
            <h1 className="text-3xl font-bold text-bark-900 mb-1">
              {activity.title}
            </h1>
            <p className="text-base text-warm-gray-500 mb-6">
              {formatted}
            </p>

            {authenticated ? (
              <button
                onClick={() => handleAction(false)}
                disabled={submitting}
                className="mx-auto w-[200px] h-[200px] rounded-full bg-violet-600 text-white text-3xl font-bold flex items-center justify-center shadow-[0_4px_20px_rgba(124,58,237,0.3)] hover:bg-violet-700 transition-colors disabled:opacity-50"
              >
                {submitting ? "..." : "I'm here"}
              </button>
            ) : (
              <div className="max-w-xs mx-auto">
                <div className="border border-warm-gray-200 rounded-lg p-4 mb-4">
                  <div className="flex gap-2">
                    <input
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Your name"
                      className="flex-1 px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:border-violet-400"
                    />
                    <button
                      onClick={() => handleAction(true)}
                      disabled={!guestName.trim() || submitting}
                      className="px-4 py-2 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition-colors disabled:opacity-50"
                    >
                      {submitting ? "..." : "I'm here"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <p className="text-lg text-warm-gray-400 mt-4">
              One tap. No account needed.
            </p>

            {checkedIn.length > 0 && (
              <div className="mt-6">
                <p className="text-sm font-medium text-warm-gray-500 uppercase tracking-wide mb-3">Already here:</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {checkedIn.map((a, i) => (
                    <span key={i} className="w-11 h-11 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-lg font-semibold">
                      {initial(a.name)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <h1 className="text-xl font-bold text-bark-900 mb-2">
              {activity.title}
            </h1>
            {activity.description && (
              <p className="text-warm-gray-500 mb-1">{activity.description}</p>
            )}
            <div className="flex gap-4 text-sm text-warm-gray-400 mb-6">
              {formatted && <span>{formatted}</span>}
              {activity.location && <span>{activity.location}</span>}
            </div>

            {coming.length > 0 && (
              <div className="mb-4 p-3 bg-white border border-warm-gray-200 rounded-lg">
                <p className="text-xs font-medium text-warm-gray-500 uppercase tracking-wide mb-2">
                  {coming.length} coming
                </p>
                <div className="flex flex-wrap gap-2">
                  {coming.map((a, i) => (
                    <span key={i} className="text-sm text-bark-900 bg-cream px-2 py-0.5 rounded">
                      {firstName(a.name)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {checkedIn.length > 0 && (
              <div className="mb-6 p-3 bg-white border border-warm-gray-200 rounded-lg">
                <p className="text-xs font-medium text-warm-gray-500 uppercase tracking-wide mb-2">
                  {checkedIn.length} already here
                </p>
                <div className="flex flex-wrap gap-2">
                  {checkedIn.map((a, i) => (
                    <span key={i} className="text-sm text-bark-900 bg-cream px-2 py-0.5 rounded">
                      {firstName(a.name)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {authenticated ? (
                <button
                  onClick={() => handleAction(false)}
                  disabled={submitting}
                  className="w-full py-3 bg-terracotta-500 text-cream rounded-lg font-medium hover:bg-terracotta-600 transition-colors disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "I'll be there"}
                </button>
              ) : (
                <>
                  <div className="border border-warm-gray-200 rounded-lg p-4">
                    <p className="text-sm font-medium text-bark-900 mb-3">
                      RSVP as a guest
                    </p>
                    <div className="flex gap-2">
                      <input
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Your name"
                        className="flex-1 px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:border-terracotta-400"
                      />
                      <button
                        onClick={() => handleAction(true)}
                        disabled={!guestName.trim() || submitting}
                        className="px-4 py-2 bg-terracotta-500 text-cream rounded-lg font-medium hover:bg-terracotta-600 transition-colors disabled:opacity-50"
                      >
                        {submitting ? "..." : "I'll be there"}
                      </button>
                    </div>
                  </div>

                  <div className="text-center">
                    <span className="text-sm text-warm-gray-400">or</span>
                  </div>

                  <button
                    onClick={() => signIn()}
                    className="w-full py-3 border border-warm-gray-200 rounded-lg text-bark-900 font-medium hover:border-terracotta-400 transition-colors"
                  >
                    Sign in for a full record
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
