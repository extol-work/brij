"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Activity {
  id: string;
  title: string;
  status: string;
  shareCode: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  summary: string | null;
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

function isLive(a: Activity): boolean {
  if (a.status !== "open" || !a.startsAt) return false;
  const start = new Date(a.startsAt).getTime();
  const now = Date.now();
  // If endsAt is set (Now activities), live until endsAt
  if (a.endsAt) {
    const end = new Date(a.endsAt).getTime();
    return now >= start && now <= end;
  }
  // Scheduled activities: live from 1h before to 4h after start
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
  const live = isLive(a);
  const time = formatTime(a.startsAt);
  const meta = [time, a.location].filter(Boolean).join(" · ");
  const [copied, setCopied] = useState(false);

  function copyShareLink(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/join/${a.shareCode}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Link
      href={`/activity/${a.id}`}
      className="flex items-start gap-3 py-3 px-1 border-b border-warm-gray-200 last:border-b-0 hover:bg-cream/50 transition-colors"
    >
      <DateBlock startsAt={a.startsAt} />
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-base font-semibold text-bark-900 truncate">{a.title}</p>
        {meta && <p className="text-sm text-warm-gray-500 mt-0.5">{meta}</p>}
      </div>
      <div className="flex flex-wrap justify-end items-center gap-1.5 max-w-[45%]">
        {(a.status === "open" || live) && (
          <span
            onClick={copyShareLink}
            className="text-xs px-2 py-1 rounded-full border border-warm-gray-200 text-warm-gray-500 hover:border-terracotta-400 hover:text-terracotta-500 transition-colors cursor-pointer"
          >
            {copied ? "Copied!" : "Share"}
          </span>
        )}
        {live && (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full uppercase tracking-wide">
            <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />
            Live
          </span>
        )}
        {a.status === "closed" && !a.summary && (
          <span className="text-sm px-3 py-1 rounded-full bg-violet-100 text-violet-600">
            How&apos;d it go?
          </span>
        )}
        {a.status === "closed" && a.summary && (
          <span
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.location.href = `/card/${a.id}`;
            }}
            className="text-sm px-3 py-1 rounded-full bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors cursor-pointer"
          >
            Extol Card
          </span>
        )}
        {a.status === "open" && (
          <span className="text-sm px-3 py-1 rounded-full bg-green-100 text-green-700">
            open
          </span>
        )}
        {a.status === "draft" && (
          <span className="text-sm px-3 py-1 rounded-full bg-amber-100 text-amber-700">
            draft
          </span>
        )}
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
  const router = useRouter();
  const [created, setCreated] = useState<Activity[]>([]);
  const [attended, setAttended] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingNow, setStartingNow] = useState(false);
  const [pastLimit, setPastLimit] = useState(10);

  useEffect(() => {
    if (!authenticated) {
      setLoading(false);
      return;
    }
    // Check consent before loading activities
    fetch("/api/me")
      .then((r) => r.json())
      .then((me) => {
        if (!me.consentedAt) {
          router.replace("/consent?callbackUrl=/");
          return;
        }
        return fetch("/api/activities")
          .then((r) => r.json())
          .then((data) => {
            if (data.created) setCreated(data.created);
            if (data.attended) setAttended(data.attended);
          });
      })
      .finally(() => setLoading(false));
  }, [authenticated, router]);

  if (status === "loading") return null;

  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col">
        {/* Hero */}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-6 py-16">
            <h1 className="text-7xl font-bold text-bark-900 mb-2">brij</h1>
            <p className="text-2xl text-warm-gray-500 mb-8">
              Build History Together
            </p>
            <button
              onClick={() => signIn()}
              className="px-6 py-3 text-xl bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition-colors"
            >
              Sign in to get started
            </button>
            <p className="text-sm text-warm-gray-400 mt-3">
              Free · Track activities with your crew
            </p>
          </div>
        </div>

        {/* Three features */}
        <div className="max-w-lg mx-auto px-6 pb-16">
          <div className="space-y-8">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-bark-900 mb-1">One tap to start</h3>
              <p className="text-warm-gray-500">Create an activity, share a link. People show up.</p>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-bark-900 mb-1">Everyone gets a card</h3>
              <p className="text-warm-gray-500">Shareable proof that you were there, together.</p>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-bark-900 mb-1">History builds itself</h3>
              <p className="text-warm-gray-500">No spreadsheets, no data entry. Just keep showing up.</p>
            </div>
          </div>
        </div>

        {/* Social proof */}
        <div className="text-center pb-8">
          <p className="text-sm text-warm-gray-400">
            847 activities recorded by 142 crews on brij
          </p>
        </div>

        {/* Footer */}
        <footer className="border-t border-warm-gray-200 py-4">
          <div className="text-center">
            <p className="text-xl text-warm-gray-400 font-light">
              brij · <a href="https://extol.work" className="hover:text-bark-900 transition-colors">extol.work</a> · <a href="https://extol.work/privacy" className="hover:text-bark-900 transition-colors">Privacy</a>
            </p>
          </div>
        </footer>
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

  const allPast = [...pastCreated, ...pastAttended].sort((a, b) => {
    const ta = a.startsAt ? new Date(a.startsAt).getTime() : 0;
    const tb = b.startsAt ? new Date(b.startsAt).getTime() : 0;
    return tb - ta;
  });
  const visiblePast = allPast.slice(0, pastLimit);
  const hasMorePast = allPast.length > pastLimit;

  const hasUpcoming = upcomingCreated.length > 0 || upcomingAttended.length > 0;
  const hasPast = allPast.length > 0;
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
        <button
          onClick={async () => {
            setStartingNow(true);
            const res = await fetch("/api/activities", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ mode: "now" }),
            });
            if (res.ok) {
              const activity = await res.json();
              router.push(`/activity/${activity.id}`);
            }
            setStartingNow(false);
          }}
          disabled={startingNow}
          className="w-full py-4 mb-6 bg-violet-600 text-white rounded-2xl text-lg font-bold flex items-center justify-center gap-2 hover:bg-violet-700 transition-colors disabled:opacity-50 shadow-[0_4px_20px_rgba(124,58,237,0.25)]"
        >
          <span className="text-xl">⚡</span>
          {startingNow ? "Starting..." : "Now"}
        </button>
        <p className="text-sm text-warm-gray-400 text-center -mt-4 mb-6">
          Start a live activity — people can check in immediately
        </p>

        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-semibold text-bark-900">
            Your Activities
          </h2>
          <Link
            href="/new"
            className="px-5 py-2.5 bg-terracotta-500 text-cream rounded-lg text-base font-medium hover:bg-terracotta-600 transition-colors"
          >
            Plan activity
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
                  {visiblePast.map((a) => (
                    <ActivityCard key={a.id} a={a} />
                  ))}
                </div>
                {hasMorePast && (
                  <button
                    onClick={() => setPastLimit((l) => l + 10)}
                    className="w-full mt-3 py-2.5 text-sm font-medium text-warm-gray-500 hover:text-bark-900 transition-colors"
                  >
                    Show more ({allPast.length - pastLimit} remaining)
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
