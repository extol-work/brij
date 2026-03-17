"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { identifyUser, track } from "@/lib/posthog";
import { getLocation } from "@/lib/geolocation";

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

interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string;
  role: string;
  lastSeenAt: string | null;
}

interface JournalEntry {
  id: string;
  text: string;
  createdAt: string;
  authorId: string;
  authorName: string | null;
  authorEmail: string;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  if (local.length <= 2) return `${local}***@${domain}`;
  return `${local[0]}***@${domain}`;
}

function formatTime(startsAt: string | null) {
  if (!startsAt) return null;
  const d = new Date(startsAt);
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return null;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function isLive(a: Activity): boolean {
  if (a.status !== "open" || !a.startsAt) return false;
  const start = new Date(a.startsAt).getTime();
  const now = Date.now();
  if (a.endsAt) {
    const end = new Date(a.endsAt).getTime();
    return now >= start && now <= end;
  }
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

/* ── Group Switcher ── */

function GroupSwitcher({
  groups,
  activeGroupId,
  onSelect,
}: {
  groups: Group[];
  activeGroupId: string | null;
  onSelect: (id: string) => void;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="flex items-center gap-0 mb-4">
      <div className="flex gap-4 overflow-x-auto flex-1 px-1 py-2 scrollbar-hide" style={{ scrollbarWidth: "none" }}>
        {groups.map((g) => (
          <button
            key={g.id}
            onClick={() => onSelect(g.id)}
            className="flex flex-col items-center gap-1 shrink-0"
          >
            <div
              className={`w-[52px] h-[52px] rounded-full flex items-center justify-center text-lg font-bold text-white ${
                activeGroupId === g.id
                  ? "ring-[2.5px] ring-offset-2 ring-violet-600"
                  : ""
              }`}
              style={{ backgroundColor: g.color }}
            >
              {g.name.charAt(0).toUpperCase()}
            </div>
            <span
              className={`text-[11px] max-w-[60px] text-center truncate ${
                activeGroupId === g.id
                  ? "text-bark-900 font-semibold"
                  : "text-warm-gray-500"
              }`}
            >
              {g.name}
            </span>
          </button>
        ))}

        {/* + circle */}
        <Link
          href={groups.length > 0 ? "/groups" : "/groups/new"}
          className="flex flex-col items-center gap-1 shrink-0"
        >
          <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center transition-colors" style={{ backgroundColor: "#c4b8a8" }}>
            <span className="text-2xl leading-none text-white font-bold">+</span>
          </div>
        </Link>
      </div>
    </div>
  );
}

/* ── Journal Section ── */

function JournalSection({
  group,
  userId,
  userInitial,
}: {
  group: Group;
  userId: string;
  userInitial: string;
}) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [cachedGeo, setCachedGeo] = useState<{ latitude: number; longitude: number } | null>(null);
  const journalRef = useRef<HTMLDivElement>(null);

  // Click outside to collapse
  useEffect(() => {
    if (!expanded) return;
    function handleClick(e: MouseEvent | TouchEvent) {
      if (journalRef.current && !journalRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, [expanded]);

  // Prefetch entries on mount
  useEffect(() => {
    fetch(`/api/groups/${group.id}/journal`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setEntries(data);
      })
      .finally(() => setLoaded(true));
  }, [group.id]);

  const todayEntries = entries.filter((e) => {
    const d = new Date(e.createdAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });

  const pastDays = groupByDay(entries.filter((e) => {
    const d = new Date(e.createdAt);
    const now = new Date();
    return d.toDateString() !== now.toDateString();
  }));

  function requestGeo() {
    if (!cachedGeo) {
      getLocation().then((geo) => { if (geo) setCachedGeo(geo); });
    }
  }

  async function handlePost() {
    if (!text.trim()) return;
    setPosting(true);
    const res = await fetch(`/api/groups/${group.id}/journal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...cachedGeo }),
    });
    if (res.ok) {
      const entry = await res.json();
      setEntries((prev) => [entry, ...prev]);
      track("journal_post", { group_id: group.id, word_count: text.trim().split(/\s+/).length });
      setText("");
      setExpanded(false);
    }
    setPosting(false);
  }

  async function handleDelete(entryId: string) {
    const res = await fetch(`/api/groups/${group.id}/journal`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId }),
    });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    }
  }

  const weekCount = entries.filter((e) => {
    const d = new Date(e.createdAt);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return d >= weekAgo;
  }).length;

  return (
    <div className="mb-6" ref={journalRef}>
      <div className="flex justify-between items-center mb-2 px-1">
        <h3 className="text-base font-bold text-bark-900">
          Journal <span style={{ color: group.color }}>for {group.name}</span>
        </h3>
      </div>

      {/* Input */}
      <div
        className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border mb-2 transition-all ${
          expanded
            ? "border-violet-600 shadow-[0_0_0_1px_rgba(124,58,237,1)]"
            : "border-[#E8D5BC] bg-[#FEFCF8]"
        }`}
        onClick={() => setExpanded(true)}
      >
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold text-white shrink-0"
          style={{ backgroundColor: "#8B6548" }}
        >
          {userInitial}
        </div>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => { setExpanded(true); requestGeo(); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) handlePost();
          }}
          placeholder="What are you working on?"
          className="flex-1 text-base bg-transparent outline-none placeholder-warm-gray-400 text-bark-900"
        />
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePost();
          }}
          disabled={!text.trim() || posting}
          className={`px-3.5 py-1.5 rounded-md text-xs font-semibold text-white shrink-0 transition-opacity ${
            text.trim() ? "bg-[#8B6548] opacity-100" : "bg-[#8B6548] opacity-40"
          }`}
        >
          Post
        </button>
      </div>

      {/* Collapsed count */}
      {!expanded && loaded && entries.length > 0 && (
        <p className="text-xs text-warm-gray-400 text-center">
          {todayEntries.length} {todayEntries.length === 1 ? "entry" : "entries"} today · {weekCount} this week
        </p>
      )}

      {/* Empty state */}
      {!expanded && loaded && entries.length === 0 && (
        <p className="text-sm text-warm-gray-400 text-center py-3 leading-relaxed">
          Share what you&apos;re working on.<br />
          No replies, no pressure — just a record<br />
          of the work that keeps things running.
        </p>
      )}

      {/* Expanded feed */}
      {expanded && loaded && (
        <div className="mt-3 px-1">
          {/* Today's entries */}
          {todayEntries.slice(0, 2).map((entry) => (
            <JournalEntryRow
              key={entry.id}
              entry={entry}
              groupColor={group.color}
              canDelete={entry.authorId === userId || group.role === "coordinator"}
              onDelete={() => handleDelete(entry.id)}
            />
          ))}
          {todayEntries.length > 2 && (
            <p className="text-xs text-warm-gray-400 pl-5 py-1">
              +{todayEntries.length - 2} more today
            </p>
          )}

          {/* Past days collapsed */}
          {pastDays.map(({ label, entries: dayEntries }) => (
            <CollapsedDay key={label} label={label} entries={dayEntries} groupColor={group.color} />
          ))}

          {/* Weekly rollup */}
          {weekCount > 0 && (
            <div className="flex items-center gap-3 px-4 py-3.5 bg-[#FDF8F0] border border-[#E8D5BC] rounded-xl my-4">
              <span className="text-[28px] font-bold text-[#5C3D2E] leading-none">{weekCount}</span>
              <span className="text-[13px] text-[#8B6548]">
                contributions this week
              </span>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

function JournalEntryRow({
  entry,
  groupColor,
  canDelete,
  onDelete,
}: {
  entry: JournalEntry;
  groupColor: string;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const time = new Date(entry.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const displayName = entry.authorName || entry.authorEmail.split("@")[0];

  return (
    <div className="flex gap-2.5 py-2.5 border-l-2 pl-3.5 ml-1 mb-0.5" style={{ borderColor: "#D4A574" }}>
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
        style={{ backgroundColor: groupColor }}
      >
        {displayName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-bark-900">{displayName}</p>
        <p className="text-sm text-bark-900 leading-snug mt-0.5">{entry.text}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[11px] text-warm-gray-400">{time}</span>
          {canDelete && (
            <button
              onClick={onDelete}
              className="text-[11px] text-warm-gray-300 hover:text-red-500 transition-colors"
            >
              delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CollapsedDay({
  label,
  entries,
  groupColor,
}: {
  label: string;
  entries: JournalEntry[];
  groupColor: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const uniqueAuthors = [...new Set(entries.map((e) => e.authorName || e.authorEmail.split("@")[0]))];

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-[#FEFCF8] border border-warm-gray-200 rounded-lg hover:bg-[#faf5ed] transition-colors"
      >
        <span className="text-[13px] text-warm-gray-500">
          <strong className="text-bark-900">{label}</strong> · {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
        <div className="flex items-center gap-2">
          <div className="flex -space-x-1.5">
            {uniqueAuthors.slice(0, 3).map((name, i) => (
              <div
                key={i}
                className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-semibold text-white border-[1.5px] border-[#FEFCF8]"
                style={{ backgroundColor: groupColor }}
              >
                {name.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
          <span className="text-xs text-warm-gray-400">{expanded ? "▾" : "›"}</span>
        </div>
      </button>
      {expanded && (
        <div className="mt-1">
          {entries.map((entry) => (
            <JournalEntryRow
              key={entry.id}
              entry={entry}
              groupColor={groupColor}
              canDelete={false}
              onDelete={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function groupByDay(entries: JournalEntry[]): Array<{ label: string; entries: JournalEntry[] }> {
  const days = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    const d = new Date(entry.createdAt);
    const key = d.toDateString();
    if (!days.has(key)) days.set(key, []);
    days.get(key)!.push(entry);
  }

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return Array.from(days.entries()).map(([key, entries]) => {
    let label: string;
    if (key === yesterday.toDateString()) {
      label = "Yesterday";
    } else {
      const d = new Date(key);
      label = d.toLocaleDateString(undefined, { weekday: "long" });
      // If older than a week, add the date
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      if (d < weekAgo) {
        label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      }
    }
    return { label, entries };
  });
}

/* ── Main Dashboard ── */

export default function Dashboard() {
  const { data: session, status } = useSession();
  const authenticated = status === "authenticated";
  const router = useRouter();
  const [created, setCreated] = useState<Activity[]>([]);
  const [attended, setAttended] = useState<Activity[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingNow, setStartingNow] = useState(false);
  const [pastLimit, setPastLimit] = useState(10);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    if (!authenticated) {
      setLoading(false);
      return;
    }
    // Check consent, then load activities + groups
    fetch("/api/me")
      .then((r) => r.json())
      .then((me) => {
        if (!me.consentedAt) {
          router.replace("/consent?callbackUrl=/");
          return;
        }
        setUserId(me.id);
        identifyUser({ id: me.id, email: me.email, name: me.displayName });
        return Promise.all([
          fetch("/api/activities").then((r) => r.json()),
          fetch("/api/groups").then((r) => r.json()),
        ]).then(([actData, grpData]) => {
          if (actData.created) setCreated(actData.created);
          if (actData.attended) setAttended(actData.attended);
          if (Array.isArray(grpData)) {
            setGroups(grpData);
            if (grpData.length > 0) setActiveGroupId(grpData[0].id);
          }
        });
      })
      .finally(() => setLoading(false));
  }, [authenticated, router]);

  if (status === "loading") return null;

  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-[500px] mx-auto px-6 py-8 md:py-16">
            <h1 className="text-7xl font-bold text-bark-900 mb-2">brij</h1>
            <p className="text-2xl text-warm-gray-500 mb-8">
              Build History Together
            </p>
            <div className="space-y-4 md:space-y-6 max-w-xs mx-auto mb-12 md:mb-16">
              <div className="flex gap-3 items-start text-left">
                <div className="w-9 h-9 rounded-lg bg-[#F5E6D0] border border-[#E8D5BC] flex items-center justify-center text-bark-900 text-lg shrink-0">+</div>
                <div>
                  <p className="text-sm font-semibold text-bark-900">One tap to start</p>
                  <p className="text-sm text-warm-gray-500">Create an activity, share a link. People show up.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start text-left">
                <div className="w-9 h-9 rounded-lg bg-[#F5E6D0] border border-[#E8D5BC] flex items-center justify-center text-bark-900 text-lg shrink-0">&#10003;</div>
                <div>
                  <p className="text-sm font-semibold text-bark-900">Everyone gets a card</p>
                  <p className="text-sm text-warm-gray-500">Shareable proof that you were there, together.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start text-left">
                <div className="w-9 h-9 rounded-lg bg-[#F5E6D0] border border-[#E8D5BC] flex items-center justify-center text-bark-900 text-lg shrink-0">&rarr;</div>
                <div>
                  <p className="text-sm font-semibold text-bark-900">History builds itself</p>
                  <p className="text-sm text-warm-gray-500">No spreadsheets, no data entry. Just keep showing up.</p>
                </div>
              </div>
            </div>
            <p className="text-sm text-warm-gray-400 mb-6 md:mb-8">
              <span className="font-semibold text-warm-gray-500">847 activities</span> recorded by <span className="font-semibold text-warm-gray-500">142 groups</span> on brij
            </p>
            <button
              onClick={() => signIn()}
              className="px-6 py-3 text-xl bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition-colors"
            >
              Sign in to get started
            </button>
            <p className="text-sm text-warm-gray-400 mt-3">
              Free · Track activities with your group
            </p>
          </div>
        </div>
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

  const activeGroup = groups.find((g) => g.id === activeGroupId) || null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-warm-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-baseline gap-1.5"><span className="text-2xl font-bold text-bark-900">brij</span><span className="text-base text-warm-gray-400 font-light">by Extol</span></div>
          <div className="flex items-center gap-4">
            <Link href="/settings" className="text-sm text-warm-gray-500 hover:text-bark-900 transition-colors">
              {maskEmail(session?.user?.email || "Signed in")}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6">
        {/* Group Switcher */}
        <GroupSwitcher
          groups={groups}
          activeGroupId={activeGroupId}
          onSelect={setActiveGroupId}
        />

        {/* Now Button */}
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
              track("activity_created", { type: "now", recurring: false, group_id: null });
              router.push(`/activity/${activity.id}`);
            }
            setStartingNow(false);
          }}
          disabled={startingNow}
          className="w-full py-4 mb-2 bg-violet-600 text-white rounded-2xl text-lg font-bold flex items-center justify-center gap-2 hover:bg-violet-700 transition-colors disabled:opacity-50 shadow-[0_4px_20px_rgba(124,58,237,0.25)]"
        >
          <span className="text-xl">⚡</span>
          {startingNow ? "Starting..." : "Now"}
        </button>
        <p className="text-sm text-warm-gray-400 text-center mb-6">
          Start something — share the link, people show up
        </p>

        {/* Journal Section */}
        {activeGroup && (
          <JournalSection group={activeGroup} userId={userId} userInitial={session?.user?.name?.charAt(0)?.toUpperCase() || session?.user?.email?.charAt(0)?.toUpperCase() || "?"} />
        )}

        {/* Activities */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-bark-900">
            Your Activities
          </h2>
          <Link
            href="/new"
            className="px-4 py-2 bg-violet-50 text-violet-600 rounded-lg text-sm font-semibold hover:bg-violet-100 transition-colors"
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
