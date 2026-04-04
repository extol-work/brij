"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "react-qr-code";
import { track } from "@/lib/posthog";
import { BottomNav } from "@/components/bottom-nav";

// --- Types ---

interface AggregateStats {
  activitiesOrganized: number;
  eventsAttended: number;
  groups: number;
  uniquePeopleReached: number;
  journalEntries: number;
  contributions: number;
  signaturesGiven: number;
  signaturesReceived: number;
}

interface GroupCard {
  id: string;
  title: string;
  cardUrl: string | null;
  photoUrl: string | null;
  date: string | null;
}

interface FeedItem {
  type: "activity" | "journal";
  date: string;
  title: string;
  detail?: string;
  activityId?: string;
  cardUrl?: string | null;
  text?: string;
}

interface GroupMilestone {
  type: string;
  earnedAt: string;
}

interface GroupData {
  groupId: string;
  name: string;
  type: string;
  color: string;
  role: string;
  joinedAt: string;
  memberCount: number;
  stats: {
    organized: number;
    attended: number;
    weeksSinceJoin: number;
    weeksActive: number;
  };
  feed: FeedItem[];
  cards: GroupCard[];
  milestones: GroupMilestone[];
}

interface CrossFeedItem {
  type: "activity" | "journal" | "contribution";
  date: string;
  groupId: string | null;
  groupName: string;
  groupColor: string;
  title: string;
  detail?: string;
  activityId?: string;
  text?: string;
  contributionType?: string;
  evidenceUrl?: string | null;
}

interface MeProfile {
  id: string;
  name: string;
  image: string | null;
  since: string;
  aggregate: AggregateStats;
  groups: GroupData[];
  crossFeed: CrossFeedItem[];
}

// --- Helpers ---

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatSince(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatRole(role: string): string {
  return role === "coordinator" ? "Organizer" : "Member";
}

function milestoneLabel(type: string, groupName: string): { icon: string; text: string } {
  switch (type) {
    case "first_activity_3plus":
      return { icon: "✨", text: `${groupName} — First activity with 3+ people` };
    case "first_active_week":
      return { icon: "📅", text: `${groupName} — First active week` };
    case "streak_10":
      return { icon: "🔥", text: `${groupName} — 10 week streak` };
    case "streak_25":
      return { icon: "🏔", text: `${groupName} — 25 week streak` };
    default:
      return { icon: "🏅", text: type };
  }
}

// --- Components ---

function StatCell({
  num,
  label,
  highlight,
}: {
  num: string | number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 text-center ${
        highlight
          ? "bg-amber-50 border-amber-300"
          : "bg-white border-warm-gray-200"
      }`}
    >
      <div
        className={`text-xl font-bold leading-tight ${
          highlight ? "text-amber-800" : "text-bark-900"
        }`}
      >
        {num}
      </div>
      <div
        className={`text-sm mt-0.5 ${
          highlight ? "text-amber-700" : "text-warm-gray-500"
        }`}
      >
        {label}
      </div>
    </div>
  );
}

function FeedItemRow({
  item,
  showGroup,
  groupName,
  groupColor,
}: {
  item: FeedItem | CrossFeedItem;
  showGroup?: boolean;
  groupName?: string;
  groupColor?: string;
}) {
  const content = (
    <div className="py-3 border-b border-warm-gray-100 last:border-b-0">
      <div className="text-sm text-warm-gray-400 font-medium flex items-center gap-1.5">
        {formatDate(item.date)}
        {showGroup && groupName && (
          <>
            <span>·</span>
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: groupColor }}
            />
            <span>{groupName}</span>
          </>
        )}
      </div>
      <div className="text-base font-medium text-bark-900">{item.title}</div>
      {item.type === "activity" && item.detail && (
        <div className="text-base text-warm-gray-500 mt-0.5">{item.detail}</div>
      )}
      {item.type === "journal" && "text" in item && item.text && (
        <div className="text-base text-warm-gray-500 mt-0.5 italic">
          &ldquo;{item.text.length > 100 ? item.text.slice(0, 100) + "…" : item.text}&rdquo;
        </div>
      )}
      {item.type === "contribution" && "evidenceUrl" in item && item.evidenceUrl && (
        <a
          href={item.evidenceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-violet-600 hover:underline mt-0.5 block truncate"
        >
          {item.evidenceUrl}
        </a>
      )}
    </div>
  );

  if (item.type === "activity" && "activityId" in item && item.activityId) {
    return (
      <Link href={`/activity/${item.activityId}`} className="block hover:bg-cream/50">
        {content}
      </Link>
    );
  }
  return content;
}

function MiniCard({ card }: { card: GroupCard }) {
  const bg = card.photoUrl || card.cardUrl;
  return (
    <Link
      href={`/card/${card.id}`}
      className="w-[86px] h-[114px] rounded-lg shrink-0 overflow-hidden relative flex flex-col items-center justify-center"
    >
      {bg ? (
        <img
          src={bg}
          alt={card.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-bark-700 to-bark-500" />
      )}
      <div className="relative z-10 text-center px-1">
        <div className="text-sm text-white font-medium drop-shadow-sm">
          {card.date ? formatDate(card.date) : ""}
        </div>
      </div>
    </Link>
  );
}

// --- Main Component ---

export default function MePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("summary");
  const [showAllFeed, setShowAllFeed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/me/profile")
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          setProfile(data);
          // Default to most active group if user has groups
          if (data?.groups?.length === 1) {
            setActiveTab(data.groups[0].groupId);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [status]);

  useEffect(() => {
    if (profile) {
      track("me_page_viewed", {
        groupCount: profile.groups.length,
        tab: activeTab,
      });
    }
  }, [profile, activeTab]);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploading(true);
    try {
      const canvas = document.createElement("canvas");
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise((resolve) => (img.onload = resolve));
      const size = Math.min(img.width, img.height, 512);
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9)
      );
      const formData = new FormData();
      formData.append("avatar", blob, "avatar.jpg");
      const res = await fetch("/api/users/avatar", { method: "POST", body: formData });
      if (res.ok) {
        const { image } = await res.json();
        setProfile({ ...profile, image });
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleExport(groupId?: string) {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (groupId) params.set("group", groupId);
      const res = await fetch(`/api/export/activities?${params}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "my-activities.csv";
        a.click();
        URL.revokeObjectURL(url);
        track("me_export_csv", { groupId: groupId || "all" });
      }
    } finally {
      setExporting(false);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-bark-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-warm-gray-500">Could not load profile</p>
      </div>
    );
  }

  const activeGroup = profile.groups.find((g) => g.groupId === activeTab);

  // Collect all milestones across groups
  const allMilestones = profile.groups.flatMap((g) =>
    g.milestones.map((ms) => ({
      ...milestoneLabel(ms.type, g.name),
      earnedAt: ms.earnedAt,
    }))
  );
  allMilestones.sort(
    (a, b) => new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime()
  );

  return (
    <div className="min-h-screen bg-cream pb-20">
      <div className="max-w-2xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-end gap-2 pt-4 px-5">
          <Link
            href="/settings"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-warm-gray-400 hover:text-bark-900 transition-colors"
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
          <button
            onClick={() => setShowQR(true)}
            className="shrink-0 p-1 rounded-lg hover:bg-warm-gray-100 transition-colors"
            title="Share profile"
          >
            <QRCode
              value={`${typeof window !== "undefined" ? window.location.origin : ""}/profile/${profile?.id || ""}`}
              size={28}
              level="L"
              bgColor="transparent"
            />
          </button>
        </div>

        {/* QR overlay */}
        {showQR && profile && (
          <div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
            onClick={() => setShowQR(false)}
          >
            <div className="bg-white rounded-2xl p-8 text-center" onClick={(e) => e.stopPropagation()}>
              <QRCode
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/profile/${profile.id}`}
                size={256}
                level="M"
              />
              <p className="mt-4 text-sm text-warm-gray-500">Scan to view public profile</p>
            </div>
          </div>
        )}

        {/* Profile header — tap avatar/name to return to summary */}
        <div className="text-center pt-2 pb-2 px-5">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => { setActiveTab("summary"); setShowAllFeed(false); }}
              className="relative"
            >
              {profile.image ? (
                <img
                  src={profile.image}
                  alt={profile.name}
                  className="w-20 h-20 rounded-full object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-amber-500 flex items-center justify-center text-white text-2xl font-semibold">

                  {getInitials(profile.name)}
                </div>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); avatarInputRef.current?.click(); }}
                className="absolute -bottom-1 -right-1 inline-flex items-center justify-center w-6 h-6 rounded-full bg-white border border-warm-gray-200 shadow-sm hover:bg-warm-gray-50"
                title="Change photo"
              >
                {uploading ? (
                  <div className="w-3 h-3 border border-bark-900 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                )}
              </button>
            </button>
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
          <button
            onClick={() => { setActiveTab("summary"); setShowAllFeed(false); }}
            className="block mx-auto"
          >
            <div className="text-[22px] font-bold tracking-tight mt-1">{profile.name}</div>
          </button>
          <div className="text-sm text-warm-gray-400 mt-0.5">
            On Extol since {formatSince(profile.since)}
          </div>
        </div>

        {/* Group rotator — matches dashboard pattern */}
        <div className="flex gap-3 items-center px-5 pb-4 overflow-x-auto">
          {profile.groups.map((g) => {
            const isActive = activeTab === g.groupId;
            return (
              <button
                key={g.groupId}
                onClick={() => { setActiveTab(g.groupId); setShowAllFeed(false); }}
                className="flex flex-col items-center gap-1 shrink-0"
              >
                <div
                  className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white text-lg font-bold transition-all"
                  style={{
                    backgroundColor: g.color,
                    border: isActive ? `2.5px solid ${g.color}` : "2.5px solid transparent",
                    opacity: isActive ? 1 : 0.5,
                  }}
                >
                  {g.name.charAt(0).toUpperCase()}
                </div>
                <span className={`text-[11px] truncate max-w-[60px] text-center ${
                  isActive ? "font-semibold text-bark-900" : "text-warm-gray-500"
                }`}>
                  {g.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="px-6">
          {activeTab === "summary" ? (
            <SummaryTab
              profile={profile}
              allMilestones={allMilestones}
              showAllFeed={showAllFeed}
              setShowAllFeed={setShowAllFeed}
              exporting={exporting}
              onExport={() => handleExport()}
            />
          ) : activeGroup ? (
            <GroupTab
              group={activeGroup}
              showAllFeed={showAllFeed}
              setShowAllFeed={setShowAllFeed}
              exporting={exporting}
              onExport={() => handleExport(activeGroup.groupId)}
            />
          ) : null}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

// --- Summary Tab ---

function SummaryTab({
  profile,
  allMilestones,
  showAllFeed,
  setShowAllFeed,
  exporting,
  onExport,
}: {
  profile: MeProfile;
  allMilestones: { icon: string; text: string; earnedAt: string }[];
  showAllFeed: boolean;
  setShowAllFeed: (v: boolean) => void;
  exporting: boolean;
  onExport: () => void;
}) {
  const { aggregate, crossFeed } = profile;
  const visibleFeed = showAllFeed ? crossFeed : crossFeed.slice(0, 4);

  return (
    <>
      {/* Aggregate stats — 4-cell grid per Nereid wireframe */}
      <div className="text-sm font-semibold uppercase tracking-wider text-warm-gray-500 mb-3">
        Across All Groups
      </div>
      <div className="grid grid-cols-2 gap-px bg-warm-gray-200 rounded-xl overflow-hidden mb-5">
        <div className="bg-white p-4 text-center">
          <div className="text-2xl font-bold text-bark-900">{aggregate.eventsAttended}</div>
          <div className="text-xs text-warm-gray-500 mt-0.5">Attended</div>
        </div>
        <div className="bg-white p-4 text-center">
          <div className="text-2xl font-bold" style={{ color: "#8B6548" }}>{aggregate.contributions}</div>
          <div className="text-xs text-warm-gray-500 mt-0.5">Contributions</div>
        </div>
        <div className="bg-white p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{aggregate.signaturesReceived}</div>
          <div className="text-xs text-warm-gray-500 mt-0.5">Endorsements</div>
        </div>
        <div className="bg-white p-4 text-center">
          <div className="text-2xl font-bold text-violet-600">0</div>
          <div className="text-xs text-warm-gray-500 mt-0.5">Decisions</div>
        </div>
      </div>

      <div className="h-px bg-warm-gray-200 my-5" />

      {/* Cross-community feed */}
      <div className="text-sm font-semibold uppercase tracking-wider text-warm-gray-500 mb-3">
        Recent (all groups)
      </div>
      {visibleFeed.length > 0 ? (
        <>
          {visibleFeed.map((item, i) => (
            <FeedItemRow
              key={`${item.date}-${i}`}
              item={item}
              showGroup
              groupName={item.groupName}
              groupColor={item.groupColor}
            />
          ))}
          {!showAllFeed && crossFeed.length > 4 && (
            <button
              onClick={() => setShowAllFeed(true)}
              className="text-sm text-violet-600 font-medium py-1.5"
            >
              View all →
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-warm-gray-400 py-4">No activity yet</p>
      )}

      {/* Milestones */}
      {allMilestones.length > 0 && (
        <>
          <div className="h-px bg-warm-gray-200 my-5" />
          <div className="text-sm font-semibold uppercase tracking-wider text-warm-gray-500 mb-3">
            Milestones
          </div>
          {allMilestones.map((ms, i) => (
            <div key={i} className="flex items-center gap-2.5 py-2.5 text-base text-warm-gray-500">
              <span className="text-base">{ms.icon}</span>
              <span>{ms.text}</span>
            </div>
          ))}
        </>
      )}

      <div className="h-px bg-warm-gray-200 my-5" />

      {/* Export */}
      <button
        onClick={onExport}
        disabled={exporting}
        className="w-full py-3 rounded-xl border border-warm-gray-200 bg-white text-base font-medium text-bark-900 text-center disabled:opacity-50"
      >
        {exporting ? "Exporting…" : "Export my history (CSV)"}
      </button>

      {/* Track B/C stub */}
      <div className="mt-6 mb-4 rounded-xl border border-dashed border-warm-gray-300 bg-warm-gray-50 p-4 text-center">
        <div className="text-base text-warm-gray-400 font-medium">
          Portfolio · Standing · Credits
        </div>
        <div className="text-sm text-warm-gray-300 mt-1">Coming in a future update</div>
      </div>
    </>
  );
}

// --- Group Tab ---

function GroupTab({
  group,
  showAllFeed,
  setShowAllFeed,
  exporting,
  onExport,
}: {
  group: GroupData;
  showAllFeed: boolean;
  setShowAllFeed: (v: boolean) => void;
  exporting: boolean;
  onExport: () => void;
}) {
  const visibleFeed = showAllFeed ? group.feed : group.feed.slice(0, 4);

  return (
    <>
      {/* Group chip — informational, no link */}
      <div className="inline-flex items-center gap-1.5 bg-white border border-warm-gray-200 rounded-full px-3.5 py-1.5 mb-4">
        <span
          className="w-3.5 h-3.5 rounded-full inline-block"
          style={{ backgroundColor: group.color }}
        />
        <span className="text-sm font-semibold text-bark-900">{group.name}</span>
        <span className="text-sm text-warm-gray-500">· {formatRole(group.role)} · Week {group.stats.weeksSinceJoin} · {group.memberCount} members</span>
      </div>

      {/* Scoped stats */}
      <div className="text-sm font-semibold uppercase tracking-wider text-warm-gray-500 mb-3">
        {group.role === "coordinator" ? "Your Impact" : "You Showed Up"}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        {group.role === "coordinator" ? (
          <>
            <StatCell num={group.stats.organized} label="activities organized" />
            <StatCell num={group.stats.attended} label="activities attended" />
          </>
        ) : (
          <>
            <StatCell num={group.stats.attended} label="activities attended" />
            <StatCell
              num={`${group.stats.weeksActive}/${group.stats.weeksSinceJoin}`}
              label={`weeks with ${group.name}`}
              highlight
            />
          </>
        )}
      </div>

      <div className="h-px bg-warm-gray-200 my-5" />

      {/* Extol Cards gallery */}
      {group.cards.length > 0 && (
        <>
          <div className="text-sm font-semibold uppercase tracking-wider text-warm-gray-500 mb-3">
            Your {group.name} Cards
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {group.cards.map((card) => (
              <MiniCard key={card.id} card={card} />
            ))}
          </div>
          <div className="h-px bg-warm-gray-200 my-5" />
        </>
      )}

      {/* Scoped feed */}
      <div className="text-sm font-semibold uppercase tracking-wider text-warm-gray-500 mb-3">
        Recent — {group.name}
      </div>
      {visibleFeed.length > 0 ? (
        <>
          {visibleFeed.map((item, i) => (
            <FeedItemRow key={`${item.date}-${i}`} item={item} />
          ))}
          {!showAllFeed && group.feed.length > 4 && (
            <button
              onClick={() => setShowAllFeed(true)}
              className="text-sm text-violet-600 font-medium py-1.5"
            >
              View all →
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-warm-gray-400 py-4">No activity yet</p>
      )}

      {/* Milestones */}
      {group.milestones.length > 0 && (
        <>
          <div className="h-px bg-warm-gray-200 my-5" />
          <div className="text-sm font-semibold uppercase tracking-wider text-warm-gray-500 mb-3">
            Milestones
          </div>
          {group.milestones.map((ms, i) => {
            const label = milestoneLabel(ms.type, group.name);
            return (
              <div key={i} className="flex items-center gap-2.5 py-2.5 text-base text-warm-gray-500">
                <span className="text-base">{label.icon}</span>
                <span>{label.text}</span>
              </div>
            );
          })}
        </>
      )}

      <div className="h-px bg-warm-gray-200 my-5" />

      {/* Export */}
      <button
        onClick={onExport}
        disabled={exporting}
        className="w-full py-3 rounded-xl border border-warm-gray-200 bg-white text-base font-medium text-bark-900 text-center disabled:opacity-50"
      >
        {exporting ? "Exporting…" : "Export my history (CSV)"}
      </button>

      {/* Track B/C stub */}
      <div className="mt-6 mb-4 rounded-xl border border-dashed border-warm-gray-300 bg-warm-gray-50 p-4 text-center">
        <div className="text-base text-warm-gray-400 font-medium">
          Standing · Credits · α Commitment
        </div>
        <div className="text-sm text-warm-gray-300 mt-1">Coming in a future update</div>
      </div>
    </>
  );
}
