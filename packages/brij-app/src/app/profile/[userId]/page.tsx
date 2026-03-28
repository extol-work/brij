"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Community {
  id: string;
  name: string;
  type: string;
  color: string;
  role: string;
  joinedAt: string;
  memberCount: number;
}

interface ProfileData {
  id: string;
  name: string;
  image: string | null;
  since: string;
  monthsActive: number;
  communities: Community[];
  primaryCommunity: { name: string; role: string } | null;
  highlights: {
    activitiesOrganized: number;
    eventsAttended: number;
    communities: number;
    monthsActive: number;
  };
}

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

export default function ProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [copied, setCopied] = useState(false);

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
          <h1 className="text-2xl font-bold text-bark-900">Profile not found</h1>
          <p className="text-warm-gray-500 mt-2">This profile doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }

  const primaryLabel = profile.primaryCommunity
    ? `${formatRole(profile.primaryCommunity.role)} · ${profile.primaryCommunity.name}`
    : null;

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
          {/* Ellipsis menu trigger */}
          <button
            onClick={() => setShowMenu(true)}
            className="absolute top-0 right-0 w-10 h-10 rounded-lg border border-warm-gray-200 bg-white flex items-center justify-center text-warm-gray-400 hover:text-bark-900 transition-colors"
          >
            ⋯
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
          {primaryLabel && (
            <p className="text-sm text-bark-700 mt-0.5">{primaryLabel}</p>
          )}
          <p className="text-xs text-warm-gray-400 mt-1">
            On brij since {formatDate(profile.since)}
          </p>
          <p className="text-[13px] text-warm-gray-500 font-medium mt-1">
            {profile.highlights.communities} {profile.highlights.communities === 1 ? "community" : "communities"} · {profile.highlights.monthsActive} {profile.highlights.monthsActive === 1 ? "month" : "months"} active
          </p>
        </div>

        {/* Active In */}
        <div className="mt-5">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-bark-700 mb-2.5">
            Active In
          </h2>
          {profile.communities.map((c) => (
            <div key={c.id} className="flex items-center gap-2 py-2 text-sm text-bark-900">
              <span
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: c.color }}
              />
              {c.name}
            </div>
          ))}
        </div>

        {/* Highlights */}
        <div className="mt-5">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-bark-700 mb-2.5">
            Highlights
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <HighlightCard value={profile.highlights.activitiesOrganized} label="Organized" />
            <HighlightCard value={profile.highlights.eventsAttended} label="Attended" />
            <HighlightCard value={profile.highlights.communities} label="Communities" />
            <HighlightCard
              value={`${profile.highlights.monthsActive} mo`}
              label="Active"
            />
          </div>
        </div>

        {/* CTA */}
        <div className="mt-5 bg-white border-2 border-amber-500 rounded-xl p-5 text-center">
          <p className="text-[13px] text-bark-900 leading-relaxed mb-4">
            See {profile.name.split(" ")[0]}&apos;s full profile — participation
            history, peer recognition, and community engagement across{" "}
            {profile.highlights.communities} {profile.highlights.communities === 1 ? "community" : "communities"}.
          </p>
          <a
            href="https://brij.extol.work"
            className="inline-block bg-bark-900 text-cream text-sm font-semibold py-2.5 px-6 rounded-lg hover:bg-bark-800 transition-colors"
          >
            Sign up for brij →
          </a>
        </div>

        {/* Footer */}
        <div className="text-center mt-5 pt-4 border-t border-warm-gray-200">
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
                <span className="text-lg text-warm-gray-500 w-6 text-center">🔗</span>
                {copied ? "Copied!" : "Copy profile link"}
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-3 py-3.5 w-full text-sm font-medium text-bark-900 hover:text-amber-500 transition-colors"
              >
                <span className="text-lg text-warm-gray-500 w-6 text-center">↗</span>
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

function HighlightCard({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="bg-white border border-warm-gray-200 rounded-lg p-3 text-center">
      <div className="text-xl font-bold text-bark-900 tracking-tight">{value}</div>
      <div className="text-[11px] text-warm-gray-400 mt-0.5">{label}</div>
    </div>
  );
}
