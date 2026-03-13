"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Activity {
  id: string;
  title: string;
  status: string;
  shareCode: string;
  startsAt: string | null;
  location: string | null;
  createdAt: string;
}

function formatDate(startsAt: string | null) {
  if (!startsAt) return "No date set";
  const d = new Date(startsAt);
  const date = d.toLocaleDateString();
  const hours = d.getHours();
  const mins = d.getMinutes();
  if (hours === 0 && mins === 0) return date;
  return `${date} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function isLive(startsAt: string | null): boolean {
  if (!startsAt) return false;
  const start = new Date(startsAt).getTime();
  const now = Date.now();
  const hourBefore = start - 60 * 60 * 1000;
  const fourHoursAfter = start + 4 * 60 * 60 * 1000;
  return now >= hourBefore && now <= fourHoursAfter;
}

function DateBlock({ startsAt }: { startsAt: string | null }) {
  if (!startsAt) {
    return (
      <div className="w-14 shrink-0 text-center">
        <div className="text-[15px] font-semibold uppercase text-warm-gray-400">—</div>
        <div className="text-2xl font-bold text-warm-gray-300 leading-tight">—</div>
      </div>
    );
  }
  const d = new Date(startsAt);
  const month = d.toLocaleDateString(undefined, { month: "short" });
  const day = d.getDate();
  return (
    <div className="w-14 shrink-0 text-center">
      <div className="text-[15px] font-semibold uppercase text-violet-600 tracking-wide">{month}</div>
      <div className="text-2xl font-bold text-bark-900 leading-tight">{day}</div>
    </div>
  );
}

function formatTime(startsAt: string | null) {
  if (!startsAt) return null;
  const d = new Date(startsAt);
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return null;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function ActivityCard({ a }: { a: Activity }) {
  const live = isLive(a.startsAt);
  const time = formatTime(a.startsAt);
  const meta = [time, a.location].filter(Boolean).join(" · ");
  return (
    <Link
      href={`/activity/${a.id}`}
      className="flex items-center gap-3 py-3 px-1 border-b border-warm-gray-200 last:border-b-0 hover:bg-cream/50 transition-colors"
    >
      <DateBlock startsAt={a.startsAt} />
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-bark-900 truncate">{a.title}</p>
        {meta && <p className="text-sm text-warm-gray-500 mt-0.5">{meta}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {live && (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full uppercase tracking-wide">
            <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />
            Live
          </span>
        )}
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            a.status === "open"
              ? "bg-green-100 text-green-700"
              : a.status === "closed"
              ? "bg-warm-gray-200 text-warm-gray-500"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {a.status === "closed" ? "Done" : a.status}
        </span>
      </div>
    </Link>
  );
}

function isUpcoming(a: Activity) {
  return a.status === "open" || a.status === "draft";
}

export default function Dashboard() {
  const { data: session, status } = useSession();
  const authenticated = status === "authenticated";
  const [created, setCreated] = useState<Activity[]>([]);
  const [attended, setAttended] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authenticated) {
      setLoading(false);
      return;
    }
    fetch("/api/activities")
      .then((r) => r.json())
      .then((data) => {
        if (data.created) setCreated(data.created);
        if (data.attended) setAttended(data.attended);
      })
      .finally(() => setLoading(false));
  }, [authenticated]);

  if (status === "loading") return null;

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="mb-4">
            <h1 className="text-7xl font-bold text-bark-900">brij</h1>
            <p className="text-xl text-warm-gray-400 font-light">by Extol</p>
          </div>
          <p className="text-2xl text-warm-gray-500 mb-8">
            Build History Together
          </p>
          <button
            onClick={() => signIn()}
            className="px-6 py-3 text-xl bg-terracotta-500 text-cream rounded-lg font-medium hover:bg-terracotta-600 transition-colors"
          >
            Sign in to get started
          </button>
        </div>
      </div>
    );
  }

  const sortByStartAsc = (a: Activity, b: Activity) => {
    const ta = a.startsAt ? new Date(a.startsAt).getTime() : Infinity;
    const tb = b.startsAt ? new Date(b.startsAt).getTime() : Infinity;
    return ta - tb;
  };
  const sortByStartDesc = (a: Activity, b: Activity) => {
    const ta = a.startsAt ? new Date(a.startsAt).getTime() : 0;
    const tb = b.startsAt ? new Date(b.startsAt).getTime() : 0;
    return tb - ta;
  };

  const upcomingCreated = created.filter(isUpcoming).sort(sortByStartAsc);
  const pastCreated = created.filter((a) => !isUpcoming(a)).sort(sortByStartDesc);
  const upcomingAttended = attended.filter(isUpcoming).sort(sortByStartAsc);
  const pastAttended = attended.filter((a) => !isUpcoming(a)).sort(sortByStartDesc);

  const hasUpcoming = upcomingCreated.length > 0 || upcomingAttended.length > 0;
  const hasPast = pastCreated.length > 0 || pastAttended.length > 0;
  const hasNothing = !hasUpcoming && !hasPast;

  return (
    <div className="min-h-screen">
      <header className="border-b border-warm-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-1.5"><span className="text-2xl font-bold text-bark-900">brij</span><span className="text-base text-warm-gray-400 font-light">by Extol</span></div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-warm-gray-500">
              {session?.user?.email || "Signed in"}
            </span>
            <button
              onClick={() => signOut()}
              className="text-sm text-warm-gray-400 hover:text-bark-900"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-semibold text-bark-900">
            Your Activities
          </h2>
          <Link
            href="/new"
            className="px-4 py-2 bg-terracotta-500 text-cream rounded-lg text-sm font-medium hover:bg-terracotta-600 transition-colors"
          >
            Create activity
          </Link>
        </div>

        {loading ? (
          <p className="text-warm-gray-500">Loading...</p>
        ) : hasNothing ? (
          <div className="text-center py-16 border border-dashed border-warm-gray-200 rounded-xl">
            <p className="text-warm-gray-500 mb-4">
              No activities yet. Create your first one.
            </p>
            <Link
              href="/new"
              className="text-terracotta-500 font-medium hover:underline"
            >
              Create an activity
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {upcomingCreated.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-warm-gray-500 uppercase tracking-wide mb-3">
                  Organized by you
                </h3>
                <div>
                  {upcomingCreated.map((a) => (
                    <ActivityCard key={a.id} a={a} />
                  ))}
                </div>
              </div>
            )}

            {upcomingAttended.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-warm-gray-500 uppercase tracking-wide mb-3">
                  Attending
                </h3>
                <div>
                  {upcomingAttended.map((a) => (
                    <ActivityCard key={a.id} a={a} />
                  ))}
                </div>
              </div>
            )}

            {hasPast && (
              <div className="pt-4 border-t border-warm-gray-200">
                <h3 className="text-sm font-medium text-warm-gray-500 uppercase tracking-wide mb-3">
                  Past activities
                </h3>
                <div>
                  {[...pastCreated, ...pastAttended].map((a) => (
                    <ActivityCard key={a.id} a={a} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
