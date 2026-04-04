"use client";

import { useState } from "react";

export interface ContributionData {
  id: string;
  description: string;
  contributionType: "collaborative" | "published_work" | "solo_self_report";
  evidenceUrl: string | null;
  createdBy: string;
  createdByName: string | null;
  groupId: string | null;
  groupName: string | null;
  createdAt: string;
  members: {
    userId: string;
    displayName: string | null;
    confirmed: boolean;
    confirmedAt: string | null;
  }[];
  confirmCount: number;
  memberCount: number;
}

const BORDER_COLORS: Record<string, string> = {
  collaborative_signed: "#16a34a",   // green
  collaborative_pending: "#D4A574",  // tan
  published_work: "#2563eb",         // blue
  solo_self_report: "#D4A574",       // tan
};

function getBorderColor(c: ContributionData): string {
  if (c.contributionType === "published_work") return BORDER_COLORS.published_work;
  if (c.contributionType === "collaborative" && c.confirmCount > 0) return BORDER_COLORS.collaborative_signed;
  if (c.contributionType === "collaborative") return BORDER_COLORS.collaborative_pending;
  return BORDER_COLORS.solo_self_report;
}

export function ContributionCard({
  contribution: c,
  currentUserId,
  onSign,
  onDismiss,
  onDelete,
  rateLimitReached,
}: {
  contribution: ContributionData;
  currentUserId: string;
  onSign?: (id: string) => Promise<void>;
  onDismiss?: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  rateLimitReached?: boolean;
}) {
  const [signing, setSigning] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDismissConfirm, setShowDismissConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [localConfirmed, setLocalConfirmed] = useState(false);
  const [localDismissed, setLocalDismissed] = useState(false);

  if (localDismissed) return null;

  const borderColor = localConfirmed
    ? "#16a34a"
    : getBorderColor(c);

  const isAuthor = c.createdBy === currentUserId;
  const isTaggedMember = c.members.some((m) => m.userId === currentUserId);
  const alreadyConfirmed = c.members.some((m) => m.userId === currentUserId && m.confirmed);
  const canSign = !isAuthor && !alreadyConfirmed && !localConfirmed && c.contributionType !== "solo_self_report" && c.groupId;
  const canDismiss = isTaggedMember && !alreadyConfirmed && !localConfirmed;

  const time = new Date(c.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  const authorInitial = (c.createdByName || "?").charAt(0).toUpperCase();

  async function handleSign() {
    if (!onSign) return;
    setSigning(true);
    await onSign(c.id);
    setLocalConfirmed(true);
    setSigning(false);
  }

  async function handleDismiss() {
    if (!onDismiss) return;
    setDismissing(true);
    await onDismiss(c.id);
    setLocalDismissed(true);
    setDismissing(false);
  }

  return (
    <div
      className="border rounded-xl p-4 mb-3 bg-white"
      style={{ borderLeft: `3px solid ${borderColor}` }}
    >
      {/* Author + time */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
          style={{ backgroundColor: "#8B6548" }}
        >
          {authorInitial}
        </div>
        <span className="text-[13px] font-semibold text-bark-900">
          {c.createdByName || "Unknown"}
        </span>
        <span className="text-[11px] text-warm-gray-400 ml-auto">{time}</span>
      </div>

      {/* Description */}
      <p className="text-sm text-bark-900 leading-snug mb-2">{c.description}</p>

      {/* Evidence URL (published work) */}
      {c.evidenceUrl && (
        <div
          className="rounded-lg px-3 py-2 mb-2"
          style={{
            backgroundColor: c.contributionType === "published_work" ? "#eff6ff" : "#f8f6f3",
            border: `1px solid ${c.contributionType === "published_work" ? "#bfdbfe" : "#e8e0d6"}`,
          }}
        >
          {c.contributionType === "published_work" && (
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block mb-0.5">
              Published work
            </span>
          )}
          <a
            href={c.evidenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-medium text-blue-600 hover:underline break-all"
          >
            &#128279; {(() => { try { return new URL(c.evidenceUrl!).hostname; } catch { return c.evidenceUrl; } })()}
          </a>
        </div>
      )}

      {/* Collaborator chips */}
      {c.members.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-2">
          <span className="text-xs text-warm-gray-500 mr-1">With</span>
          {c.members.map((m) => {
            const isConfirmed = m.confirmed || (m.userId === currentUserId && localConfirmed);
            return (
              <span
                key={m.userId}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  isConfirmed
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-violet-50 text-violet-700 border border-violet-200"
                }`}
              >
                <span
                  className="w-[16px] h-[16px] rounded-full flex items-center justify-center text-[7px] font-bold text-white"
                  style={{ backgroundColor: isConfirmed ? "#16a34a" : "#7c3aed" }}
                >
                  {isConfirmed ? "\u2713" : (m.displayName || "?").charAt(0).toUpperCase()}
                </span>
                {m.displayName || "Unknown"}
                {m.userId === currentUserId && (
                  <span className="text-[9px] opacity-60">(you)</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Solo self-report label */}
      {c.contributionType === "solo_self_report" && (
        <div className="px-2.5 py-1.5 bg-warm-gray-100 rounded-md mb-2">
          <span className="text-[11px] text-warm-gray-500">
            Solo contribution &middot; no collaborators tagged
          </span>
        </div>
      )}

      {/* Signature count */}
      {c.contributionType === "collaborative" && c.confirmCount > 0 && (
        <div className="flex items-center gap-1 mb-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-xs font-semibold text-green-600">
            {c.confirmCount} peer {c.confirmCount === 1 ? "signature" : "signatures"}
          </span>
        </div>
      )}

      {/* Pending count for collaborative */}
      {c.contributionType === "collaborative" && c.confirmCount === 0 && c.memberCount > 0 && (
        <span className="text-[11px] text-warm-gray-400 block mb-2">
          {c.memberCount} collaborator{c.memberCount === 1 ? "" : "s"} &middot; awaiting signatures
        </span>
      )}

      {/* Dismiss confirmation */}
      {showDismissConfirm && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-2">
          <p className="text-[13px] font-semibold text-amber-800 mb-1">Remove yourself?</p>
          <p className="text-xs text-amber-700 mb-2">
            You&apos;ll be removed as a collaborator on this contribution.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDismiss}
              disabled={dismissing}
              className="px-3 py-1.5 text-xs font-medium border border-amber-300 rounded-lg text-amber-700 bg-white hover:bg-amber-50 disabled:opacity-50"
            >
              {dismissing ? "Removing..." : "Yes, remove me"}
            </button>
            <button
              onClick={() => setShowDismissConfirm(false)}
              className="px-3 py-1.5 text-xs text-warm-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {(canSign || canDismiss) && !showDismissConfirm && (
        <div className="flex gap-2 mt-1">
          {canSign && (
            <button
              onClick={handleSign}
              disabled={signing || rateLimitReached}
              className={`px-3.5 py-1.5 text-[13px] font-medium rounded-lg transition-colors ${
                rateLimitReached
                  ? "bg-gray-100 text-warm-gray-400 cursor-not-allowed opacity-60"
                  : "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
              }`}
            >
              {signing ? "Signing..." : rateLimitReached ? "Limit reached" : "Sign"}
            </button>
          )}
          {canDismiss && (
            <button
              onClick={() => setShowDismissConfirm(true)}
              className="px-3.5 py-1.5 text-[13px] font-medium bg-white text-warm-gray-500 border border-warm-gray-200 rounded-lg hover:bg-warm-gray-50"
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {/* Rate limit message */}
      {rateLimitReached && canSign && (
        <p className="text-[11px] text-amber-600 mt-1">
          You&apos;ve reached today&apos;s limit (5 signatures). Try again tomorrow.
        </p>
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-2">
          <p className="text-[13px] font-semibold text-red-800 mb-1">Delete this entry?</p>
          <p className="text-xs text-red-700 mb-2">This cannot be undone.</p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!onDelete) return;
                setDeleting(true);
                await onDelete(c.id);
                setDeleting(false);
              }}
              disabled={deleting}
              className="px-3 py-1.5 text-xs font-medium border border-red-300 rounded-lg text-red-700 bg-white hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Yes, delete"}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-3 py-1.5 text-xs text-warm-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Author delete link */}
      {isAuthor && onDelete && !showDeleteConfirm && (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="text-[11px] text-warm-gray-300 hover:text-red-500 transition-colors mt-1"
        >
          delete
        </button>
      )}

      {/* Group / personal label */}
      {!c.groupId && (
        <span className="text-[11px] text-warm-gray-400 block mt-1">Personal</span>
      )}
    </div>
  );
}
