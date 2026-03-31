"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// --- Types ---

type ViewTier = "self" | "member" | "authenticated" | "visitor";

interface Community {
  id: string;
  name: string;
  type?: string;
  color: string;
  role?: string;
  joinedAt?: string;
  memberCount?: number;
  isShared?: boolean;
  organized?: number;
  attended?: number;
}

interface Quote {
  text: string;
  authorName: string;
  groupName: string;
}

interface ProfileData {
  id: string;
  name: string;
  image: string | null;
  since: string;
  viewTier: ViewTier;
  sharedCommunityCount?: number;
  primaryCommunity: { name: string; role: string } | null;
  communities: Community[];
  highlights: {
    activitiesOrganized: number;
    eventsAttended: number;
    communities: number;
    monthsActive: number;
  };
  roleBreakdown?: { coordinated: number; participated: number };
  contributionBreakdown?: { type: string; count: number }[];
  quotes?: Quote[];
  featuredQuote?: Quote | null;
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

function formatRole(role: string): string {
  return role === "coordinator" ? "Organizer" : "Member";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function contributionLabel(type: string): string {
  const labels: Record<string, string> = {
    attendance: "Attendance",
    labor: "Labor",
    supply: "Supplies",
    cash: "Cash",
    other: "Other",
  };
  return labels[type] || type;
}

// --- Main Component ---

export default function ProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAllCommunities, setShowAllCommunities] = useState(false);

  useEffect(() => {
    fetch(`/api/profile/${userId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setProfile(data))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return null;
  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-bark-900">
            Profile not found
          </h1>
          <p className="text-warm-gray-500 mt-2">
            This profile doesn&apos;t exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  const tier = profile.viewTier;
  const isVisitor = tier === "visitor";
  const isAuthenticated = tier === "authenticated";
  const isMember = tier === "member";
  const isSelf = tier === "self";
  const showDetail = !isVisitor; // authenticated+ gets richer cards

  const primaryLabel = profile.primaryCommunity
    ? `${formatRole(profile.primaryCommunity.role)} · ${profile.primaryCommunity.name}`
    : null;

  // Only show role/title for logged-in viewers
  const showRole = !isVisitor;

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setShowMenu(false);
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({
        title: `${profile!.name} on brij`,
        url: window.location.href,
      });
    } else {
      handleCopyLink();
    }
    setShowMenu(false);
  }

  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-md mx-auto px-5 py-8">
        {/* Profile Header */}
        <div className="text-center pb-5 border-b border-warm-gray-200 relative">
          <button
            onClick={() => setShowMenu(true)}
            className="absolute top-0 right-0 w-10 h-10 rounded-lg border border-warm-gray-200 bg-white flex items-center justify-center text-warm-gray-400 hover:text-bark-900 transition-colors"
          >
            &#x22EF;
          </button>

          {/* Avatar */}
          {profile.image ? (
            <img
              src={profile.image}
              alt={profile.name}
              className="w-24 h-24 rounded-full mx-auto mb-3 border-3 border-white shadow-md object-cover"
            />
          ) : (
            <div
              className="w-24 h-24 rounded-full mx-auto mb-3 flex items-center justify-center text-white text-4xl font-bold border-3 border-white shadow-md"
              style={{
                background: `linear-gradient(135deg, ${profile.communities[0]?.color || "#7c3aed"}, ${profile.communities[1]?.color || "#f59e0b"})`,
              }}
            >
              {getInitials(profile.name)}
            </div>
          )}

          <h1 className="text-[22px] font-bold tracking-tight text-bark-900">
            {profile.name}
          </h1>
          {showRole && primaryLabel && (
            <p className="text-sm text-bark-700 mt-0.5">{primaryLabel}</p>
          )}
          <p className="text-xs text-warm-gray-400 mt-1">
            On brij since {formatDate(profile.since)}
          </p>
          <p className="text-[13px] text-warm-gray-500 font-medium mt-1">
            {profile.highlights.communities}{" "}
            {profile.highlights.communities === 1 ? "community" : "communities"}{" "}
            · {profile.highlights.monthsActive}{" "}
            {profile.highlights.monthsActive === 1 ? "month" : "months"} active
          </p>
        </div>

        {/* Communities Section */}
        <div className="mt-5">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-bark-700 mb-2.5">
            {isVisitor ? "Active In" : "Communities"}
          </h2>

          {(() => {
            const MAX_VISIBLE = 5;
            const communities = profile.communities;
            const visibleCommunities = showAllCommunities
              ? communities
              : communities.slice(0, MAX_VISIBLE);
            const hasMore = communities.length > MAX_VISIBLE;

            return isVisitor ? (
              <div>
                {visibleCommunities.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 py-2 text-sm text-bark-900"
                  >
                    <span
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.name}
                  </div>
                ))}
                {hasMore && !showAllCommunities && (
                  <button
                    onClick={() => setShowAllCommunities(true)}
                    className="text-[12px] text-amber-600 font-semibold mt-1 hover:text-amber-500 transition-colors"
                  >
                    Show all {communities.length} communities
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {visibleCommunities.map((c) => (
                  <CommunityCard
                    key={c.id}
                    community={c}
                    showCounts={(isMember && c.isShared) || isSelf}
                  />
                ))}
                {hasMore && !showAllCommunities && (
                  <button
                    onClick={() => setShowAllCommunities(true)}
                    className="w-full text-[12px] text-amber-600 font-semibold py-2 hover:text-amber-500 transition-colors"
                  >
                    Show all {communities.length} communities
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* Quotes — "What X is known for" */}
        {showDetail && (profile.quotes?.length ?? 0) > 0 && (
          <div className="mt-5">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-bark-700 mb-2.5">
              What {profile.name.split(" ")[0]} Has Written
            </h2>
            <div className="space-y-2">
              {profile.quotes!.map((q, i) => (
                <div
                  key={i}
                  className="bg-white border border-warm-gray-200 rounded-xl p-3.5"
                >
                  <p className="text-sm italic text-bark-900 leading-relaxed">
                    &ldquo;{q.text}&rdquo;
                  </p>
                  <p className="text-[11px] text-bark-700 font-medium mt-2">
                    &mdash; {q.groupName}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-warm-gray-400 italic mt-2">
              Journal entries from {profile.name.split(" ")[0]}&apos;s
              communities.
            </p>
          </div>
        )}

        {/* Visitor: one featured quote */}
        {isVisitor && profile.featuredQuote && (
          <div className="mt-5">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-bark-700 mb-2.5">
              Featured
            </h2>
            <div className="bg-white border border-warm-gray-200 rounded-xl p-3.5">
              <p className="text-sm italic text-bark-900 leading-relaxed">
                &ldquo;{profile.featuredQuote.text}&rdquo;
              </p>
              <p className="text-[11px] text-bark-700 font-medium mt-2">
                &mdash; {profile.featuredQuote.groupName}
              </p>
            </div>
          </div>
        )}

        {/* Highlights */}
        <div className="mt-5">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-bark-700 mb-2.5">
            Highlights
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <HighlightCard
              value={profile.highlights.activitiesOrganized}
              label="Organized"
            />
            <HighlightCard
              value={profile.highlights.eventsAttended}
              label="Attended"
            />
            <HighlightCard
              value={profile.highlights.communities}
              label="Communities"
            />
            <HighlightCard
              value={`${profile.highlights.monthsActive} mo`}
              label="Active"
            />
          </div>
        </div>

        {/* Role Breakdown (authenticated+) */}
        {showDetail && profile.roleBreakdown && (
          <RoleBreakdown
            coordinated={profile.roleBreakdown.coordinated}
            participated={profile.roleBreakdown.participated}
          />
        )}

        {/* Contribution Type Breakdown (authenticated+) */}
        {showDetail &&
          profile.contributionBreakdown &&
          profile.contributionBreakdown.length > 0 && (
            <div className="mt-5">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-bark-700 mb-2.5">
                Contribution Types
              </h2>
              <div className="bg-white border border-warm-gray-200 rounded-xl p-3.5">
                {profile.contributionBreakdown.map((c) => {
                  const total = profile.contributionBreakdown!.reduce(
                    (sum, x) => sum + x.count,
                    0
                  );
                  const pct = total > 0 ? Math.round((c.count / total) * 100) : 0;
                  return (
                    <div
                      key={c.type}
                      className="flex items-center gap-2 mb-1.5 last:mb-0"
                    >
                      <span className="text-[11px] text-warm-gray-500 w-16 flex-shrink-0">
                        {contributionLabel(c.type)}
                      </span>
                      <div className="flex-1 h-2 bg-warm-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-bark-700 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-semibold text-bark-900 w-8 text-right">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        {/* Connection nudge — authenticated, no shared communities */}
        {isAuthenticated && (
          <div className="mt-5 bg-amber-50 border border-amber-300 rounded-xl p-4 text-center">
            <p className="text-[13px] text-amber-900 font-medium">
              You and {profile.name.split(" ")[0]} aren&apos;t in any communities
              together yet.
            </p>
            <p className="text-[11px] text-amber-700 mt-1">
              Join one of their communities to see participation details.
            </p>
          </div>
        )}

        {/* Private section — co-members only (placeholder for governance data) */}
        {isMember && (profile.sharedCommunityCount ?? 0) > 0 && (
          <div className="mt-5">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-violet-600 mb-2.5 flex items-center gap-1">
              <span>&#128274;</span> For Shared Community Members
            </h2>
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-3.5">
              <p className="text-[12px] text-violet-700 font-medium mb-2">
                Shared Community Detail
              </p>
              {profile.communities
                .filter((c) => c.isShared)
                .map((c) => (
                  <div
                    key={c.id}
                    className="flex justify-between items-center py-1.5 text-[12px] text-bark-900"
                  >
                    <span className="text-warm-gray-500">{c.name}</span>
                    <span className="font-semibold">
                      {c.organized ?? 0} organized · {c.attended ?? 0} attended
                    </span>
                  </div>
                ))}
              <p className="text-[10px] text-violet-400 italic mt-2 pt-2 border-t border-violet-200 text-center">
                Only visible to co-members. Governance detail coming soon.
              </p>
            </div>
          </div>
        )}

        {/* CTA — visitor only */}
        {isVisitor && (
          <div className="mt-5 bg-white border-2 border-amber-500 rounded-xl p-5 text-center">
            <p className="text-[13px] text-bark-900 leading-relaxed mb-4">
              See {profile.name.split(" ")[0]}&apos;s full profile —
              participation history, peer recognition, and community engagement
              across {profile.highlights.communities}{" "}
              {profile.highlights.communities === 1
                ? "community"
                : "communities"}
              .
            </p>
            <a
              href="https://brij.extol.work"
              className="inline-block bg-bark-900 text-cream text-sm font-semibold py-2.5 px-6 rounded-lg hover:bg-bark-800 transition-colors"
            >
              Sign up for brij &rarr;
            </a>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-5 pt-4 border-t border-warm-gray-200">
          {(isMember || isSelf) && (
            <p className="text-[12px] text-warm-gray-500 mb-2">
              {isSelf
                ? "This is how others see your profile"
                : `${profile.sharedCommunityCount} ${(profile.sharedCommunityCount ?? 0) === 1 ? "community" : "communities"} in common`}
            </p>
          )}
          {isAuthenticated && (
            <p className="text-[12px] text-warm-gray-500 mb-2">
              0 communities in common
            </p>
          )}
          <p className="text-[11px] text-warm-gray-400">
            brij.extol.work · Community value, made visible
          </p>
        </div>
      </div>

      {/* Bottom sheet menu */}
      {showMenu && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex items-end justify-center"
          onClick={() => setShowMenu(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-t-3xl pb-8 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-warm-gray-200 rounded-full" />
            </div>
            <div className="px-5">
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-3 py-3.5 w-full border-b border-warm-gray-200 text-sm font-medium text-bark-900 hover:text-amber-500 transition-colors"
              >
                <span className="text-lg text-warm-gray-500 w-6 text-center">
                  &#128279;
                </span>
                {copied ? "Copied!" : "Copy profile link"}
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-3 py-3.5 w-full text-sm font-medium text-bark-900 hover:text-amber-500 transition-colors"
              >
                <span className="text-lg text-warm-gray-500 w-6 text-center">
                  &#8599;
                </span>
                Share profile
              </button>
              <button
                onClick={() => setShowMenu(false)}
                className="w-full mt-3 py-3 rounded-lg border border-warm-gray-200 bg-cream text-sm font-semibold text-warm-gray-500 hover:bg-warm-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function CommunityCard({
  community: c,
  showCounts,
}: {
  community: Community;
  showCounts: boolean;
}) {
  return (
    <div className="bg-white border border-warm-gray-200 rounded-xl p-3.5">
      <div className="flex items-center gap-2 mb-1">
        <span
          className="w-4 h-4 rounded-full flex-shrink-0"
          style={{ backgroundColor: c.color }}
        />
        <span className="text-sm font-semibold text-bark-900 flex-1">
          {c.name}
        </span>
        {c.isShared && (
          <span className="text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-300 px-2 py-0.5 rounded-full whitespace-nowrap">
            You&apos;re both members
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap mt-1">
        {c.role && (
          <span className="text-[11px] text-warm-gray-500">
            {formatRole(c.role)}
          </span>
        )}
        {c.joinedAt && (
          <>
            <span className="w-0.5 h-0.5 rounded-full bg-warm-gray-400" />
            <span className="text-[11px] text-warm-gray-400">
              Since {formatDate(c.joinedAt)}
            </span>
          </>
        )}
        {showCounts && c.organized != null && (
          <>
            <span className="w-0.5 h-0.5 rounded-full bg-warm-gray-400" />
            <span className="text-[11px] text-warm-gray-400">
              {c.organized} organized · {c.attended} attended
            </span>
          </>
        )}
        {c.memberCount != null && c.memberCount > 0 && (
          <>
            <span className="w-0.5 h-0.5 rounded-full bg-warm-gray-400" />
            <span className="text-[11px] text-warm-gray-400">
              {c.memberCount} members
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function RoleBreakdown({
  coordinated,
  participated,
}: {
  coordinated: number;
  participated: number;
}) {
  const total = coordinated + participated;
  if (total === 0) return null;
  const coordPct = Math.round((coordinated / total) * 100);
  const partPct = 100 - coordPct;

  return (
    <div className="mt-5">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-bark-700 mb-2.5">
        Role Breakdown
      </h2>
      <div className="bg-white border border-warm-gray-200 rounded-xl p-3.5">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] text-warm-gray-500 w-20 flex-shrink-0">
            Organized
          </span>
          <div className="flex-1 h-2 bg-warm-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full"
              style={{ width: `${coordPct}%` }}
            />
          </div>
          <span className="text-[11px] font-semibold text-bark-900 w-8 text-right">
            {coordPct}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-warm-gray-500 w-20 flex-shrink-0">
            Participated
          </span>
          <div className="flex-1 h-2 bg-warm-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-bark-700 rounded-full"
              style={{ width: `${partPct}%` }}
            />
          </div>
          <span className="text-[11px] font-semibold text-bark-900 w-8 text-right">
            {partPct}%
          </span>
        </div>
      </div>
    </div>
  );
}

function HighlightCard({
  value,
  label,
}: {
  value: number | string;
  label: string;
}) {
  return (
    <div className="bg-white border border-warm-gray-200 rounded-lg p-3 text-center">
      <div className="text-xl font-bold text-bark-900 tracking-tight">
        {value}
      </div>
      <div className="text-[11px] text-warm-gray-400 mt-0.5">{label}</div>
    </div>
  );
}
