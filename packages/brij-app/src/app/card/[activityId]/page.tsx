"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { track } from "@/lib/posthog";

interface Activity {
  id: string;
  title: string;
  status: string;
  startsAt: string | null;
  location: string | null;
  updatedAt: string;
  cardUrl: string | null;
}

export default function CardViewer() {
  const { activityId } = useParams<{ activityId: string }>();
  const router = useRouter();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    track("card_viewed", { referrer: document.referrer || "direct" });
    fetch(`/api/activities/${activityId}`)
      .then((r) => r.json())
      .then(setActivity);
  }, [activityId]);

  const cacheBust = activity?.updatedAt ? `?v=${new Date(activity.updatedAt).getTime()}` : "";
  const cardUrl = activity?.cardUrl || `/api/cards/${activityId}${cacheBust}`;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/card/${activityId}` : "";

  async function handleShare() {
    if (!navigator.share) {
      handleCopyLink();
      return;
    }

    try {
      // Try sharing the image
      const res = await fetch(cardUrl);
      const blob = await res.blob();
      const file = new File([blob], `extol-card-${activityId}.png`, { type: "image/png" });

      await navigator.share({
        title: activity?.title ?? "Extol Card",
        text: activity ? `${activity.title} — check it out` : "Check out my Extol Card",
        url: shareUrl,
        files: [file],
      });
    } catch {
      // Fallback: share without image
      try {
        await navigator.share({
          title: activity?.title ?? "Extol Card",
          text: activity ? `${activity.title} — check it out` : "Check out my Extol Card",
          url: shareUrl,
        });
      } catch {
        // User cancelled or not supported
      }
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(cardUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `extol-card-${activity?.title?.replace(/\s+/g, "-").toLowerCase() ?? activityId}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Download failed
    }
    setSaving(false);
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={() => router.back()}
          className="text-white/70 hover:text-white text-sm"
        >
          &larr; Back
        </button>
        <span className="text-white/50 text-xs font-medium uppercase tracking-wide">
          Extol Card
        </span>
        <div className="w-12" />
      </div>

      {/* Card image — centered, max height with aspect ratio */}
      <div className="flex-1 flex items-center justify-center px-6 py-4">
        <div className="w-full max-w-[340px] aspect-[9/16] rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
          <img
            src={cardUrl}
            alt={activity?.title ?? "Extol Card"}
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Share sheet */}
      <div className="bg-white rounded-t-2xl px-6 pt-4 pb-8">
        <div className="w-9 h-1 bg-gray-300 rounded-full mx-auto mb-5" />
        <div className="flex justify-center gap-6 flex-wrap">
          <button
            onClick={() => { track("card_shared", { method: "share" }); handleShare(); }}
            className="flex flex-col items-center gap-1.5"
          >
            <div className="w-14 h-14 rounded-2xl bg-violet-600 text-white flex items-center justify-center text-2xl">
              &#x2197;
            </div>
            <span className="text-xs font-medium text-gray-500">Share</span>
          </button>
          <button
            onClick={() => { track("card_shared", { method: "save" }); handleSave(); }}
            disabled={saving}
            className="flex flex-col items-center gap-1.5"
          >
            <div className="w-14 h-14 rounded-2xl bg-gray-900 text-white flex items-center justify-center text-2xl">
              &#x2193;
            </div>
            <span className="text-xs font-medium text-gray-500">
              {saving ? "Saving..." : "Save"}
            </span>
          </button>
          {/* Instagram Stories — mobile only */}
          {isMobile && (
            <button
              onClick={async () => {
                track("card_shared", { method: "instagram_stories" });
                try {
                  const res = await fetch(cardUrl);
                  const blob = await res.blob();
                  const file = new File([blob], "extol-card.png", { type: "image/png" });
                  // Try native share targeting Instagram
                  if (navigator.share) {
                    await navigator.share({
                      files: [file],
                    });
                  }
                } catch {
                  // Fallback: open Instagram
                  window.open("instagram://story-camera", "_blank");
                }
              }}
              className="flex flex-col items-center gap-1.5"
            >
              <div className="w-14 h-14 rounded-2xl text-white flex items-center justify-center text-xl" style={{ background: "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)" }}>
                IG
              </div>
              <span className="text-xs font-medium text-gray-500">Stories</span>
            </button>
          )}
          {/* Tweet */}
          <button
            onClick={() => {
              track("card_shared", { method: "twitter" });
              const text = encodeURIComponent(activity ? `${activity.title} — we showed up` : "We showed up");
              const url = encodeURIComponent(shareUrl);
              window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, "_blank");
            }}
            className="flex flex-col items-center gap-1.5"
          >
            <div className="w-14 h-14 rounded-2xl bg-black text-white flex items-center justify-center text-lg font-bold">
              𝕏
            </div>
            <span className="text-xs font-medium text-gray-500">Tweet</span>
          </button>
          <button
            onClick={() => { track("card_shared", { method: "copy_link" }); handleCopyLink(); }}
            className="flex flex-col items-center gap-1.5"
          >
            <div className="w-14 h-14 rounded-2xl bg-gray-100 border border-gray-200 text-gray-900 flex items-center justify-center text-xl">
              &#x1F517;
            </div>
            <span className="text-xs font-medium text-gray-500">
              {copied ? "Copied!" : "Copy link"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
