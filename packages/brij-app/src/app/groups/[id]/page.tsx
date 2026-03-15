"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Member {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  name: string | null;
  email: string;
}

interface JournalEntry {
  id: string;
  text: string;
  createdAt: string;
  authorId: string;
  authorName: string | null;
  authorEmail: string;
}

interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  color: string;
  members: Member[];
  entryCount: number;
  currentMembership: { role: string };
}

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session, status } = useSession();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"journal" | "members">("journal");
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetch(`/api/groups/${id}`).then((r) => r.json()),
      fetch(`/api/groups/${id}/journal`).then((r) => r.json()),
    ])
      .then(([g, j]) => {
        if (g.id) setGroup(g);
        if (Array.isArray(j)) setEntries(j);
      })
      .finally(() => setLoading(false));
  }, [id, status]);

  if (status === "loading" || loading) return null;
  if (!group) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-warm-gray-500">Group not found or you are not a member.</p>
      </div>
    );
  }

  const isCoordinator = group.currentMembership?.role === "coordinator";

  async function handlePost() {
    if (!text.trim()) return;
    setPosting(true);
    const res = await fetch(`/api/groups/${id}/journal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      const entry = await res.json();
      setEntries((prev) => [entry, ...prev]);
      setText("");
    }
    setPosting(false);
  }

  async function handleDelete(entryId: string) {
    const res = await fetch(`/api/groups/${id}/journal`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId }),
    });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError("");
    const res = await fetch(`/api/groups/${id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail }),
    });
    if (res.ok) {
      // Refresh group to get updated member list
      const g = await fetch(`/api/groups/${id}`).then((r) => r.json());
      if (g.id) setGroup(g);
      setInviteEmail("");
    } else {
      const data = await res.json();
      setInviteError(data.error || "Failed to invite");
    }
    setInviting(false);
  }

  // Group entries by day
  const today = new Date().toDateString();
  const todayEntries = entries.filter((e) => new Date(e.createdAt).toDateString() === today);
  const pastEntries = entries.filter((e) => new Date(e.createdAt).toDateString() !== today);
  const pastDays = groupByDay(pastEntries);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-warm-gray-200">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/groups" className="text-base text-violet-600">&lsaquo; Back</Link>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
            style={{ backgroundColor: group.color }}
          >
            {group.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-bark-900 truncate">{group.name}</h1>
            {group.description && (
              <p className="text-[13px] text-warm-gray-500 truncate">{group.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="max-w-lg mx-auto px-4 py-3">
        <div className="flex gap-px bg-warm-gray-200 rounded-xl overflow-hidden">
          <div className="flex-1 bg-white py-3 text-center">
            <p className="text-xl font-bold text-bark-900">{group.members.length}</p>
            <p className="text-[11px] text-warm-gray-400">members</p>
          </div>
          <div className="flex-1 bg-white py-3 text-center">
            <p className="text-xl font-bold text-bark-900">{group.entryCount}</p>
            <p className="text-[11px] text-warm-gray-400">entries</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-lg mx-auto px-4">
        <div className="flex gap-1 border-b border-warm-gray-200 mb-4">
          {(["journal", "members"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
                tab === t
                  ? "border-violet-600 text-bark-900"
                  : "border-transparent text-warm-gray-400 hover:text-warm-gray-600"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "journal" && (
          <div>
            {/* Journal input */}
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-[#E8D5BC] bg-[#FEFCF8] mb-4">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && text.trim()) handlePost();
                }}
                placeholder="What are you working on?"
                className="flex-1 text-sm bg-transparent outline-none placeholder-warm-gray-400 text-bark-900"
              />
              <button
                onClick={handlePost}
                disabled={!text.trim() || posting}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold text-white shrink-0 transition-opacity ${
                  text.trim() ? "bg-[#8B6548] opacity-100" : "bg-[#8B6548] opacity-40"
                }`}
              >
                Post
              </button>
            </div>

            {/* Today's entries */}
            {todayEntries.length > 0 && (
              <div className="mb-3">
                <p className="text-[13px] font-semibold text-warm-gray-500 mb-2">Today</p>
                {todayEntries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    color={group.color}
                    canDelete={entry.authorId === session?.user?.id || isCoordinator}
                    onDelete={() => handleDelete(entry.id)}
                  />
                ))}
              </div>
            )}

            {/* Past days */}
            {pastDays.map(({ label, entries: dayEntries }) => (
              <CollapsedDay key={label} label={label} entries={dayEntries} color={group.color} />
            ))}

            {entries.length === 0 && (
              <p className="text-sm text-warm-gray-400 text-center py-8 leading-relaxed">
                Share what you&apos;re working on.<br />
                No replies, no pressure — just a record<br />
                of the work that keeps things running.
              </p>
            )}
          </div>
        )}

        {tab === "members" && (
          <div>
            {/* Member list */}
            <div className="border border-warm-gray-200 rounded-lg divide-y divide-warm-gray-200 mb-4">
              {group.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold text-white"
                      style={{ backgroundColor: group.color }}
                    >
                      {(m.name || m.email).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-bark-900">{m.name || m.email.split("@")[0]}</p>
                      <p className="text-[11px] text-warm-gray-400">{m.email}</p>
                    </div>
                  </div>
                  {m.role === "coordinator" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                      Coordinator
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Invite form (coordinator only) */}
            {isCoordinator && (
              <form onSubmit={handleInvite} className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  placeholder="Invite by email"
                  className="flex-1 px-3 py-2 border border-warm-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-600"
                />
                <button
                  type="submit"
                  disabled={inviting}
                  className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
                >
                  Invite
                </button>
              </form>
            )}
            {inviteError && <p className="text-sm text-red-600 mt-2">{inviteError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  color,
  canDelete,
  onDelete,
}: {
  entry: JournalEntry;
  color: string;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const time = new Date(entry.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const name = entry.authorName || entry.authorEmail.split("@")[0];

  return (
    <div className="flex gap-2.5 py-2.5 border-l-2 pl-3.5 ml-1 mb-0.5" style={{ borderColor: "#D4A574" }}>
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
        style={{ backgroundColor: color }}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-bark-900">{name}</p>
        <p className="text-sm text-bark-900 leading-snug mt-0.5">{entry.text}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[11px] text-warm-gray-400">{time}</span>
          {canDelete && (
            <button onClick={onDelete} className="text-[11px] text-warm-gray-300 hover:text-red-500 transition-colors">
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
  color,
}: {
  label: string;
  entries: JournalEntry[];
  color: string;
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
                style={{ backgroundColor: color }}
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
            <EntryRow key={entry.id} entry={entry} color={color} canDelete={false} onDelete={() => {}} />
          ))}
        </div>
      )}
    </div>
  );
}

function groupByDay(entries: JournalEntry[]): Array<{ label: string; entries: JournalEntry[] }> {
  const days = new Map<string, JournalEntry[]>();
  for (const entry of entries) {
    const key = new Date(entry.createdAt).toDateString();
    if (!days.has(key)) days.set(key, []);
    days.get(key)!.push(entry);
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return Array.from(days.entries()).map(([key, dayEntries]) => {
    let label: string;
    if (key === yesterday.toDateString()) {
      label = "Yesterday";
    } else {
      const d = new Date(key);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      label = d < weekAgo
        ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : d.toLocaleDateString(undefined, { weekday: "long" });
    }
    return { label, entries: dayEntries };
  });
}
