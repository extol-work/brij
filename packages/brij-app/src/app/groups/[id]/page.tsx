"use client";

import { useSession, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "react-qr-code";
import { getLocation } from "@/lib/geolocation";
import { track } from "@/lib/posthog";

interface GroupPreview {
  id: string;
  name: string;
  description: string | null;
  color: string;
  membershipMode: string;
  joinCode: string;
  memberCount: number;
  membershipStatus: string | null;
}

interface Member {
  id: string;
  userId: string;
  role: string;
  status: string;
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

interface GroupActivity {
  id: string;
  title: string;
  status: string;
  startsAt: string | null;
  location: string | null;
  closedAt: string | null;
  shareCode: string;
  attendeeCount: number;
  myStatus: string | null;
  cardUrl: string | null;
}

interface ExpenseEntry {
  id: string;
  description: string;
  amount: string;
  currency: string;
  date: string;
  authorId: string;
  authorName: string | null;
  authorEmail: string;
  confirmations: Array<{ id: string; confirmedById: string; confirmedByName: string | null }>;
}

interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  color: string;
  joinCode: string;
  membershipMode: string;
  createdById: string;
  members: Member[];
  entryCount: number;
  milestoneCount: number;
  currentMembership: { role: string };
}

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"events" | "journal" | "expenses" | "members" | "settings">("events");
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [todayExpanded, setTodayExpanded] = useState(false);
  const [cachedGeo, setCachedGeo] = useState<{ latitude: number; longitude: number } | null>(null);
  const [groupActivities, setGroupActivities] = useState<GroupActivity[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [joinAction, setJoinAction] = useState<"idle" | "joining" | "requesting" | "done">("idle");

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated") {
      // Load preview for unauthenticated users
      fetch(`/api/groups/${id}/preview`)
        .then((r) => r.json())
        .then((data) => { if (data.id) setPreview(data); })
        .finally(() => setLoading(false));
      return;
    }
    Promise.all([
      fetch(`/api/groups/${id}`).then((r) => r.json()),
      fetch(`/api/groups/${id}/journal`).then((r) => r.json()),
      fetch(`/api/groups/${id}/activities`).then((r) => r.json()).catch(() => []),
      fetch(`/api/groups/${id}/expenses`).then((r) => r.json()).catch(() => []),
    ])
      .then(([g, j, a, e]) => {
        if (g.id) {
          setGroup(g);
          if (Array.isArray(j)) setEntries(j);
          if (Array.isArray(a)) setGroupActivities(a);
          if (Array.isArray(e)) setExpenses(e);
        } else {
          // Not a member — load preview
          fetch(`/api/groups/${id}/preview`)
            .then((r) => r.json())
            .then((data) => { if (data.id) setPreview(data); });
        }
      })
      .finally(() => setLoading(false));
  }, [id, status]);

  if (status === "loading" || loading) return null;
  if (!group) {
    if (!preview) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <p className="text-warm-gray-500 mb-4">Group not found.</p>
            <Link href="/" className="text-violet-600 font-medium hover:underline">
              Go to dashboard
            </Link>
          </div>
        </div>
      );
    }

    const isPending = preview.membershipStatus === "pending";
    const isInviteOnly = preview.membershipMode === "invite_only";

    async function handleJoin() {
      if (!preview) return;
      setJoinAction("joining");
      const res = await fetch("/api/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: preview.joinCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setJoinAction("done");
        track("group_joined", { method: "profile_link" });
        setTimeout(() => window.location.reload(), 1000);
      } else if (data.error === "Already a member") {
        window.location.reload();
      } else if (data.error === "invite_only") {
        setJoinAction("idle");
      } else {
        setJoinAction("idle");
      }
    }

    async function handleRequestAdmission() {
      if (!preview) return;
      setJoinAction("requesting");
      const res = await fetch("/api/groups/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: preview.joinCode, requestAdmission: true }),
      });
      const data = await res.json();
      if (data.status === "pending") {
        setJoinAction("done");
        track("group_admission_requested", { groupId: preview.id });
      } else if (data.error === "Already a member") {
        window.location.reload();
      }
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="text-center max-w-sm px-6">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white mx-auto mb-4"
            style={{ backgroundColor: preview.color }}
          >
            {preview.name.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-2xl font-bold text-bark-900 mb-1">{preview.name}</h1>
          {preview.description && (
            <p className="text-sm text-warm-gray-500 mb-2">{preview.description}</p>
          )}
          <p className="text-xs text-warm-gray-400 mb-6">
            {preview.memberCount} member{preview.memberCount !== 1 ? "s" : ""}
          </p>

          {status !== "authenticated" ? (
            <button
              onClick={() => signIn(undefined, { callbackUrl: `/groups/${id}` })}
              className="w-full px-6 py-3 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition-colors mb-4"
            >
              Sign in to join
            </button>
          ) : isPending || joinAction === "done" ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl mb-4">
              <p className="text-sm text-green-700 font-medium">
                {isPending ? "Request pending" : isInviteOnly ? "Request sent" : "Joined!"}
              </p>
              <p className="text-xs text-green-600 mt-1">
                {isPending || isInviteOnly ? "The coordinator will review your request." : "Redirecting..."}
              </p>
            </div>
          ) : isInviteOnly ? (
            <>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
                <p className="text-sm text-amber-800 font-medium">This group is invite-only</p>
              </div>
              <button
                onClick={handleRequestAdmission}
                disabled={joinAction === "requesting"}
                className="w-full px-6 py-3 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50 mb-4"
              >
                {joinAction === "requesting" ? "Requesting..." : "Request to join"}
              </button>
            </>
          ) : (
            <button
              onClick={handleJoin}
              disabled={joinAction === "joining"}
              className="w-full px-6 py-3 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50 mb-4"
            >
              {joinAction === "joining" ? "Joining..." : "Join this community"}
            </button>
          )}

          <Link href="/" className="text-violet-600 font-medium hover:underline text-sm">
            Go to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const isCoordinator = group.currentMembership?.role === "coordinator";

  function requestGeo() {
    if (!cachedGeo) {
      getLocation().then((geo) => { if (geo) setCachedGeo(geo); });
    }
  }

  async function handlePost() {
    if (!text.trim()) return;
    setPosting(true);
    const res = await fetch(`/api/groups/${id}/journal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...cachedGeo }),
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
    setInviteSuccess("");
    const res = await fetch(`/api/groups/${id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail }),
    });
    const data = await res.json();
    if (res.ok) {
      setInviteSuccess(
        data.userExists
          ? `Invite sent to ${inviteEmail} — they'll need to accept it`
          : `Invite sent to ${inviteEmail} — they'll need to sign up first`
      );
      setInviteEmail("");
    } else {
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
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
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
          <button onClick={() => setShowQR(true)} className="shrink-0 p-1 rounded-lg hover:bg-warm-gray-100 transition-colors">
            <QRCode
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/groups/join/${group.joinCode}`}
              size={36}
              level="L"
            />
          </button>
        </div>
      </div>

      {/* QR overlay */}
      {showQR && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          onClick={() => setShowQR(false)}
        >
          <div className="bg-white rounded-2xl p-8" onClick={(e) => e.stopPropagation()}>
            <QRCode
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/groups/join/${group.joinCode}`}
              size={256}
              level="M"
            />
            <p className="text-center text-sm text-warm-gray-500 mt-4">Scan to join <strong>{group.name}</strong></p>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="max-w-2xl mx-auto px-4 py-3">
        <div className="flex gap-px bg-warm-gray-200 rounded-xl overflow-hidden">
          <div className="flex-1 bg-white py-3 text-center">
            <p className="text-xl font-bold text-bark-900">{group.members.filter((m) => m.status === "active").length}</p>
            <p className="text-[11px] text-warm-gray-400">members</p>
          </div>
          <div className="flex-1 bg-white py-3 text-center">
            <p className="text-xl font-bold text-bark-900">{groupActivities.length}</p>
            <p className="text-[11px] text-warm-gray-400">events</p>
          </div>
          <div className="flex-1 bg-white py-3 text-center">
            <p className="text-xl font-bold text-bark-900">{group.milestoneCount}</p>
            <p className="text-[11px] text-warm-gray-400">milestones</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex gap-1 border-b border-warm-gray-200 mb-4">
          {(["events", "journal", "expenses", "members", ...(isCoordinator ? ["settings" as const] : [])] as const).map((t) => (
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

        {tab === "events" && (
          <EventsTab activities={groupActivities} groupId={group.id} isCoordinator={isCoordinator} onActivityUpdated={(updated) => setGroupActivities((prev) => prev.map((a) => a.id === updated.id ? { ...a, ...updated } : a))} />
        )}

        {tab === "journal" && (
          <div>
            {/* Journal input */}
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-[#E8D5BC] bg-[#FEFCF8] mb-4">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onFocus={requestGeo}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && text.trim()) handlePost();
                }}
                placeholder="What are you working on?"
                className="flex-1 text-base bg-transparent outline-none placeholder-warm-gray-400 text-bark-900"
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

            {/* Today's entries (max 3 collapsed, expand to all) */}
            {todayEntries.length > 0 && (
              <div className="mb-3">
                <p className="text-[13px] font-semibold text-warm-gray-500 mb-2">Today</p>
                {(todayExpanded ? todayEntries : todayEntries.slice(0, 3)).map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    color={group.color}
                    canDelete={entry.authorId === session?.user?.id || isCoordinator}
                    onDelete={() => handleDelete(entry.id)}
                  />
                ))}
                {todayEntries.length > 3 && !todayExpanded && (
                  <button
                    onClick={() => setTodayExpanded(true)}
                    className="text-xs text-violet-600 font-medium pl-5 py-1 hover:underline"
                  >
                    +{todayEntries.length - 3} more today
                  </button>
                )}
                {todayExpanded && todayEntries.length > 3 && (
                  <button
                    onClick={() => setTodayExpanded(false)}
                    className="w-full text-xs text-warm-gray-400 py-2 hover:text-warm-gray-600"
                  >
                    Collapse
                  </button>
                )}
              </div>
            )}

            {/* Past days (collapsed) */}
            {pastDays.map(({ label, entries: dayEntries }) => (
              <CollapsedDay key={label} label={label} entries={dayEntries} color={group.color} />
            ))}

            {/* Weekly rollup */}
            {entries.length > 0 && (
              <WeeklyRollup entries={entries} />
            )}

            {entries.length === 0 && (
              <p className="text-sm text-warm-gray-400 text-center py-8 leading-relaxed">
                Share what you&apos;re working on.<br />
                No replies, no pressure — just a record<br />
                of the work that keeps things running.
              </p>
            )}
          </div>
        )}

        {tab === "expenses" && (
          <ExpensesTab
            expenses={expenses}
            groupId={group.id}
            isCoordinator={isCoordinator}
            userId={session?.user?.id || ""}
            onExpenseAdded={(e) => setExpenses((prev) => [e, ...prev])}
            onConfirmed={(entryId, confirmation) =>
              setExpenses((prev) =>
                prev.map((e) =>
                  e.id === entryId
                    ? { ...e, confirmations: [...e.confirmations, confirmation] }
                    : e
                )
              )
            }
          />
        )}

        {tab === "members" && (
          <div>
            {/* Invite by email (coordinator only) — above member list */}
            {isCoordinator && (
              <form onSubmit={handleInvite} className="flex gap-2 mb-4">
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
            {inviteError && <p className="text-sm text-red-600 mb-4">{inviteError}</p>}
            {inviteSuccess && <p className="text-sm text-green-600 mb-4">{inviteSuccess}</p>}

            {/* Pending requests (coordinator only) */}
            {isCoordinator && group.members.filter((m) => m.status === "pending").length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Pending requests</p>
                <div className="border border-amber-200 bg-amber-50 rounded-lg divide-y divide-amber-200">
                  {group.members.filter((m) => m.status === "pending").map((m) => (
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
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            const res = await fetch(`/api/groups/${id}/members`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ membershipId: m.id, action: "approve" }),
                            });
                            if (res.ok) {
                              setGroup({
                                ...group,
                                members: group.members.map((x) =>
                                  x.id === m.id ? { ...x, status: "active" } : x
                                ),
                              });
                            }
                          }}
                          className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={async () => {
                            const res = await fetch(`/api/groups/${id}/members`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ membershipId: m.id, action: "ignore" }),
                            });
                            if (res.ok) {
                              setGroup({
                                ...group,
                                members: group.members.filter((x) => x.id !== m.id),
                              });
                            }
                          }}
                          className="px-3 py-1 border border-warm-gray-200 rounded-lg text-xs text-warm-gray-500 hover:bg-warm-gray-50"
                        >
                          Ignore
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active member list */}
            <div className="border border-warm-gray-200 rounded-lg divide-y divide-warm-gray-200 mb-4">
              {group.members.filter((m) => m.status === "active").map((m) => (
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
                  {m.role === "coordinator" ? (
                    isCoordinator && (m.userId === session?.user?.id || m.userId !== group.createdById) ? (
                      <button
                        onClick={async () => {
                          if (!confirm(m.userId === session?.user?.id ? "Demote yourself?" : "Demote this coordinator?")) return;
                          const res = await fetch(`/api/groups/${id}/members`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ membershipId: m.id, action: "demote" }),
                          });
                          if (res.ok) {
                            setGroup({
                              ...group,
                              members: group.members.map((x) =>
                                x.id === m.id ? { ...x, role: "member" } : x
                              ),
                            });
                          }
                        }}
                        className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 hover:bg-red-100 hover:text-red-600 transition-colors cursor-pointer"
                        title="Click to demote"
                      >
                        Coordinator
                      </button>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                        Coordinator
                      </span>
                    )
                  ) : isCoordinator ? (
                    <button
                      onClick={async () => {
                        const res = await fetch(`/api/groups/${id}/members`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ membershipId: m.id, action: "promote" }),
                        });
                        if (res.ok) {
                          setGroup({
                            ...group,
                            members: group.members.map((x) =>
                              x.id === m.id ? { ...x, role: "coordinator" } : x
                            ),
                          });
                        }
                      }}
                      className="text-xs px-2 py-0.5 rounded-full border border-warm-gray-200 text-warm-gray-400 hover:border-violet-400 hover:text-violet-600 transition-colors"
                    >
                      Promote
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            {/* Leave group (non-coordinators) */}
            {!isCoordinator && (
              <LeaveGroupButton groupId={group.id} onLeft={() => router.push("/")} />
            )}

            {/* Share invite link */}
            <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg">
              <p className="text-xs text-violet-600 font-semibold mb-2">Invite link</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/groups/join/${group.joinCode}`}
                  className="flex-1 px-3 py-2 bg-white border border-violet-200 rounded-lg text-sm text-bark-900 font-mono"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/groups/join/${group.joinCode}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 shrink-0"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        )}

        {tab === "settings" && isCoordinator && (
          <div className="space-y-8">
            <EditGroupForm group={group} onUpdated={(g) => setGroup({ ...group, ...g })} />
            <GroupExport groupId={group.id} groupName={group.name} />
            {session?.user?.id === group.createdById && (
              <DeleteGroup groupId={group.id} groupName={group.name} onDeleted={() => router.push("/")} />
            )}
          </div>
        )}

        {/* Bottom spacer for scroll breathing room */}
        <div className="h-16" />
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

function EventsTab({ activities, groupId, isCoordinator, onActivityUpdated }: { activities: GroupActivity[]; groupId: string; isCoordinator: boolean; onActivityUpdated: (a: Partial<GroupActivity> & { id: string }) => void }) {
  const upcoming = activities.filter((a) => a.status === "open" || a.status === "draft");
  const past = activities.filter((a) => a.status === "closed");
  const [pastLimit, setPastLimit] = useState(10);
  const visiblePast = past.slice(0, pastLimit);

  async function handleAction(activityId: string, action: "rsvp" | "checkin") {
    const res = await fetch(`/api/groups/${groupId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityId, action }),
    });
    if (res.ok) {
      const data = await res.json();
      onActivityUpdated({ id: activityId, myStatus: data.status });
    }
  }

  return (
    <div className="pb-8">
      {isCoordinator && (
        <div className="flex justify-end mb-4">
          <a
            href={`/new?groupId=${groupId}`}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 transition-colors"
          >
            + Create event
          </a>
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-warm-gray-500 uppercase tracking-wide mb-2">Upcoming</p>
          <div className="border border-warm-gray-200 rounded-lg divide-y divide-warm-gray-200">
            {upcoming.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-3">
                <a href={`/activity/${a.id}`} className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                  <p className="text-sm font-medium text-bark-900">{a.title}</p>
                  <p className="text-xs text-warm-gray-400">
                    {a.startsAt ? new Date(a.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "No date"}
                    {a.location && ` · ${a.location}`}
                  </p>
                </a>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {a.myStatus === "checked_in" ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Checked in</span>
                  ) : a.myStatus === "coming" ? (
                    <button
                      onClick={() => handleAction(a.id, "checkin")}
                      className="text-xs px-3 py-1 rounded-full bg-violet-600 text-white font-semibold hover:bg-violet-700"
                    >
                      Check in
                    </button>
                  ) : (
                    <button
                      onClick={() => handleAction(a.id, "rsvp")}
                      className="text-xs px-3 py-1 rounded-full border border-violet-300 text-violet-600 font-semibold hover:bg-violet-50"
                    >
                      Join
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-warm-gray-500 uppercase tracking-wide mb-2">Past</p>
          <div className="border border-warm-gray-200 rounded-lg divide-y divide-warm-gray-200">
            {visiblePast.map((a) => (
              <div key={a.id} className="flex items-center px-4 py-3 gap-3">
                <div className="text-sm text-warm-gray-400 font-medium shrink-0 w-12 text-center">
                  {a.startsAt ? (
                    <>
                      <div>{new Date(a.startsAt).toLocaleDateString(undefined, { month: "short" })}</div>
                      <div className="text-base text-bark-700 font-semibold">{new Date(a.startsAt).getDate()}</div>
                    </>
                  ) : (
                    <div>—</div>
                  )}
                </div>
                <a href={`/activity/${a.id}`} className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                  <p className="text-base font-medium text-bark-900 truncate">{a.title}</p>
                  <p className="text-sm text-warm-gray-400">
                    {a.location && `${a.location} · `}
                    {a.attendeeCount > 0 ? `${a.attendeeCount} attended` : "No attendees"}
                    {a.myStatus === "checked_in" && " · ✓ You"}
                  </p>
                </a>
                {a.cardUrl ? (
                  <a href={`/card/${a.id}`} className="shrink-0 w-10 h-14 rounded overflow-hidden hover:opacity-80 transition-opacity">
                    <img src={a.cardUrl} alt="Extol Card" className="w-full h-full object-cover" />
                  </a>
                ) : (
                  <div className="shrink-0 w-10 h-14 rounded bg-warm-gray-100 flex items-center justify-center">
                    <span className="text-warm-gray-300 text-xs">—</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          {past.length > pastLimit && (
            <button
              onClick={() => setPastLimit((l) => l + 10)}
              className="w-full mt-3 py-2.5 text-sm font-medium text-warm-gray-500 hover:text-bark-900 transition-colors"
            >
              Show more ({past.length - pastLimit} remaining)
            </button>
          )}
        </div>
      )}

      {activities.length === 0 && (
        <p className="text-sm text-warm-gray-400 text-center py-8">No activities for this group yet.</p>
      )}
    </div>
  );
}

function ExpensesTab({
  expenses,
  groupId,
  isCoordinator,
  userId,
  onExpenseAdded,
  onConfirmed,
}: {
  expenses: ExpenseEntry[];
  groupId: string;
  isCoordinator: boolean;
  userId: string;
  onExpenseAdded: (e: ExpenseEntry) => void;
  onConfirmed: (entryId: string, confirmation: { id: string; confirmedById: string; confirmedByName: string | null }) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch(`/api/groups/${groupId}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, amount, date }),
    });
    if (res.ok) {
      const entry = await res.json();
      onExpenseAdded(entry);
      setDescription("");
      setAmount("");
      setShowAdd(false);
    }
    setSubmitting(false);
  }

  async function handleConfirm(entryId: string) {
    const res = await fetch(`/api/groups/${groupId}/expenses`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId }),
    });
    if (res.ok) {
      const confirmation = await res.json();
      onConfirmed(entryId, confirmation);
    }
  }

  const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

  return (
    <div>
      {/* Header with total */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-warm-gray-400 uppercase tracking-wide">Total recorded</p>
          <p className="text-xl font-bold text-bark-900">${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
        {isCoordinator && (
          <button
            onClick={() => setShowAdd(true)}
            className="text-sm text-violet-600 font-semibold hover:underline"
          >
            + Add expense
          </button>
        )}
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="p-4 border border-warm-gray-200 rounded-lg bg-cream/30 mb-4">
          <div className="space-y-3">
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder="What was the expense?"
              className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-violet-600"
            />
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                placeholder="Amount"
                className="w-32 px-3 py-2 border border-warm-gray-200 rounded-lg text-base"
              />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="flex-1 px-3 py-2 border border-warm-gray-200 rounded-lg text-base"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {submitting ? "Adding..." : "Add"}
              </button>
              <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-warm-gray-400">
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Expense list */}
      {expenses.length > 0 ? (
        <div className="border border-warm-gray-200 rounded-lg divide-y divide-warm-gray-200">
          {expenses.map((e) => {
            const authorName = e.authorName || e.authorEmail.split("@")[0];
            const alreadyConfirmed = e.confirmations.some((c) => c.confirmedById === userId);
            const isAuthor = e.authorId === userId;

            return (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-bark-900">{e.description}</p>
                    <p className="text-xs text-warm-gray-400">
                      {authorName} · {e.date}
                    </p>
                  </div>
                  <p className="text-sm font-mono text-bark-900 font-semibold">
                    ${parseFloat(e.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {e.confirmations.length > 0 && (
                    <div className="flex items-center gap-1">
                      {e.confirmations.map((c) => (
                        <span key={c.id} className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                          {c.confirmedByName || "Confirmed"}
                        </span>
                      ))}
                    </div>
                  )}
                  {isCoordinator && !isAuthor && !alreadyConfirmed && (
                    <button
                      onClick={() => handleConfirm(e.id)}
                      className="text-xs px-2 py-0.5 rounded-full border border-green-300 text-green-600 hover:bg-green-50 transition-colors"
                    >
                      Confirm
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-warm-gray-400 text-center py-8">No expenses recorded yet.</p>
      )}
    </div>
  );
}

function LeaveGroupButton({ groupId, onLeft }: { groupId: string; onLeft: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="w-full mt-4 mb-4 py-2.5 text-sm text-red-500 hover:text-red-700 transition-colors"
      >
        Leave group
      </button>
    );
  }

  return (
    <div className="mt-4 mb-4 p-3 border border-red-200 bg-red-50 rounded-lg">
      <p className="text-sm text-red-700 mb-2">Are you sure? You&apos;ll need a new invite to rejoin.</p>
      <div className="flex gap-2">
        <button
          onClick={async () => {
            setLeaving(true);
            const res = await fetch(`/api/groups/${groupId}`, { method: "DELETE" });
            if (res.ok) onLeft();
            setLeaving(false);
          }}
          disabled={leaving}
          className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
        >
          {leaving ? "Leaving..." : "Yes, leave"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-4 py-2 text-sm text-warm-gray-500"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function EditGroupForm({
  group,
  onUpdated,
}: {
  group: GroupDetail;
  onUpdated: (g: { name: string; description: string | null; color: string; membershipMode: string }) => void;
}) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || "");
  const [membershipMode, setMembershipMode] = useState(group.membershipMode);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/groups/${group.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || null, membershipMode }),
    });
    if (res.ok) {
      const updated = await res.json();
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-bark-900 mb-1">Group name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-violet-600"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-bark-900 mb-1">Description</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this group do?"
          className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-violet-600"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-bark-900 mb-2">Join status</label>
        <div className="flex gap-2">
          {(["invite_only", "open"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setMembershipMode(mode)}
              className={`flex-1 py-3 border-2 rounded-xl text-center transition-all ${
                membershipMode === mode
                  ? "border-violet-600 bg-violet-50"
                  : "border-[#e8e0d4]"
              }`}
            >
              <div className="text-sm font-semibold">
                {mode === "invite_only" ? "Invite only" : "Open"}
              </div>
              <div className="text-xs text-[#999] mt-0.5">
                {mode === "invite_only" ? "You add members" : "Anyone with the link"}
              </div>
            </button>
          ))}
        </div>
      </div>
      <button
        type="submit"
        disabled={saving}
        className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
      >
        {saved ? "Saved!" : saving ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}

function DeleteGroup({ groupId, groupName, onDeleted }: { groupId: string; groupName: string; onDeleted: () => void }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  if (!showConfirm) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-warm-gray-500 uppercase tracking-wide mb-3">Danger Zone</h3>
        <button
          onClick={() => setShowConfirm(true)}
          className="w-full py-2.5 bg-red-700 text-white rounded-xl text-sm font-semibold hover:bg-red-800 transition-colors"
        >
          Delete group
        </button>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-red-600 uppercase tracking-wide mb-3">Delete Group</h3>
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
        <p className="text-sm text-red-800 font-medium mb-2">This will permanently delete &ldquo;{groupName}&rdquo;</p>
        <p className="text-xs text-red-600 mb-3 leading-relaxed">
          All members will be removed. Journal entries and activities will be preserved but inaccessible. On-chain attestations remain. This cannot be undone.
        </p>
        <p className="text-xs text-red-600 mb-3">
          Type <strong>{groupName}</strong> to confirm:
        </p>
        <input
          type="text"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          placeholder={groupName}
          className="w-full px-3 py-2 border border-red-200 rounded-lg text-base text-bark-900 mb-3 focus:outline-none focus:ring-2 focus:ring-red-400"
        />
        {error && <p className="text-xs text-red-700 mb-3">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={async () => {
              setDeleting(true);
              setError("");
              const res = await fetch(`/api/groups/${groupId}/delete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirmName }),
              });
              if (res.ok) {
                onDeleted();
              } else {
                const data = await res.json();
                setError(data.error || "Failed to delete");
                setDeleting(false);
              }
            }}
            disabled={deleting || confirmName !== groupName}
            className="px-4 py-2 bg-red-700 text-white rounded-lg text-sm font-semibold hover:bg-red-800 disabled:opacity-50"
          >
            {deleting ? "Deleting..." : "Delete forever"}
          </button>
          <button
            onClick={() => { setShowConfirm(false); setConfirmName(""); setError(""); }}
            className="px-4 py-2 text-sm text-warm-gray-500"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupExport({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exportingJournal, setExportingJournal] = useState(false);
  const [exportingMembers, setExportingMembers] = useState(false);

  async function download(type: "journal" | "members") {
    const setter = type === "journal" ? setExportingJournal : setExportingMembers;
    setter(true);
    const params = new URLSearchParams({ type });
    if (type === "journal") {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }
    const res = await fetch(`/api/groups/${groupId}/export?${params.toString()}`);
    if (res.ok) {
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${groupName.replace(/[^a-zA-Z0-9]/g, "-")}-${type}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
    setter(false);
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-warm-gray-500 uppercase tracking-wide mb-3">Export</h3>

      {/* Journal export */}
      <div className="bg-white border border-warm-gray-200 rounded-xl p-4 mb-3">
        <p className="text-sm text-bark-900 font-medium mb-1">Export journal</p>
        <p className="text-xs text-warm-gray-400 mb-3">Download all journal entries as CSV.</p>
        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="block text-xs text-warm-gray-400 mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg text-base"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-warm-gray-400 mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg text-base"
            />
          </div>
        </div>
        <button
          onClick={() => download("journal")}
          disabled={exportingJournal}
          className="w-full py-2.5 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
        >
          {exportingJournal ? "Exporting..." : "Download journal CSV"}
        </button>
        <p className="text-xs text-warm-gray-400 mt-2 text-center">Leave dates blank for all entries</p>
      </div>

      {/* Members export */}
      <div className="bg-white border border-warm-gray-200 rounded-xl p-4">
        <p className="text-sm text-bark-900 font-medium mb-1">Export members</p>
        <p className="text-xs text-warm-gray-400 mb-3">Download member list with activity and journal counts.</p>
        <button
          onClick={() => download("members")}
          disabled={exportingMembers}
          className="w-full py-2.5 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
        >
          {exportingMembers ? "Exporting..." : "Download members CSV"}
        </button>
      </div>
    </div>
  );
}

function WeeklyRollup({ entries }: { entries: JournalEntry[] }) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekEntries = entries.filter((e) => new Date(e.createdAt) >= weekAgo);
  const uniqueMembers = new Set(weekEntries.map((e) => e.authorId));

  if (weekEntries.length === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 bg-[#FDF8F0] border border-[#E8D5BC] rounded-xl my-4">
      <span className="text-[28px] font-bold text-[#5C3D2E] leading-none">{weekEntries.length}</span>
      <span className="text-[13px] text-[#8B6548]">
        contributions from <strong>{uniqueMembers.size} {uniqueMembers.size === 1 ? "member" : "members"}</strong> last week
      </span>
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
