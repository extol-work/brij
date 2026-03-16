"use client";

import { useSession, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { track } from "@/lib/posthog";

interface GroupPreview {
  id: string;
  name: string;
  description: string | null;
  color: string;
  membershipMode: string;
}

export default function JoinGroup() {
  const { code } = useParams<{ code: string }>();
  const { status } = useSession();
  const router = useRouter();
  const [preview, setPreview] = useState<GroupPreview | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(false);
  const [inviteOnly, setInviteOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [requested, setRequested] = useState(false);
  const [requesting, setRequesting] = useState(false);

  // Load group preview
  useEffect(() => {
    fetch(`/api/groups/join?code=${code}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.id) setPreview(data);
        else setError(data.error || "Group not found");
      })
      .finally(() => setLoading(false));
  }, [code]);

  // Auto-join if authenticated and group is open
  useEffect(() => {
    if (status !== "authenticated" || !preview) return;
    if (preview.membershipMode === "invite_only") {
      setInviteOnly(true);
      return;
    }
    attemptJoin();
  }, [status, preview]);

  async function attemptJoin() {
    setJoining(true);
    const res = await fetch("/api/groups/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (res.ok) {
      setJoined(true);
      track("group_joined", { method: "direct_link" });
      setTimeout(() => router.push(`/groups/${data.groupId}`), 1500);
    } else if (data.error === "Already a member") {
      router.push(`/groups/${data.groupId}`);
    } else if (data.error === "invite_only") {
      setInviteOnly(true);
    } else {
      setError(data.error || "Failed to join");
    }
    setJoining(false);
  }

  if (loading) return null;

  if (status === "loading") return null;

  // Unauthenticated
  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="text-center max-w-sm px-6">
          {preview && (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mx-auto mb-4"
              style={{ backgroundColor: preview.color }}
            >
              {preview.name.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-2xl font-bold text-bark-900 mb-1">
            {preview ? preview.name : "brij"}
          </h1>
          {preview?.description && (
            <p className="text-sm text-warm-gray-500 mb-4">{preview.description}</p>
          )}
          <p className="text-warm-gray-500 mb-6">
            Sign in to {preview?.membershipMode === "invite_only" ? "view this group" : "join this group"}.
          </p>
          <button
            onClick={() => signIn(undefined, { callbackUrl: `/groups/join/${code}` })}
            className="px-6 py-3 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition-colors"
          >
            Sign in
          </button>
        </div>
      </div>
    );
  }

  // Invite only
  if (inviteOnly && preview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
        <div className="text-center max-w-sm px-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mx-auto mb-4"
            style={{ backgroundColor: preview.color }}
          >
            {preview.name.charAt(0).toUpperCase()}
          </div>
          <h2 className="text-xl font-bold text-bark-900 mb-1">{preview.name}</h2>
          {preview.description && (
            <p className="text-sm text-warm-gray-500 mb-4">{preview.description}</p>
          )}
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
            <p className="text-sm text-amber-800 font-medium">This group is invite-only</p>
            <p className="text-xs text-amber-600 mt-1">
              Ask the group coordinator to send you an invite link.
            </p>
          </div>

          {requested ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl mb-6">
              <p className="text-sm text-green-700 font-medium">Request sent</p>
              <p className="text-xs text-green-600 mt-1">The coordinator will review your request.</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-warm-gray-400 mb-3">— or —</p>
              <button
                onClick={async () => {
                  setRequesting(true);
                  const res = await fetch("/api/groups/join", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code, requestAdmission: true }),
                  });
                  const data = await res.json();
                  if (data.status === "pending") {
                    setRequested(true);
                  } else if (data.error === "Already a member") {
                    router.push(`/groups/${data.groupId}`);
                  }
                  setRequesting(false);
                }}
                disabled={requesting}
                className="px-6 py-3 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50 mb-6"
              >
                {requesting ? "Requesting..." : "Request admission"}
              </button>
            </>
          )}

          <div>
            <button
              onClick={() => router.push("/")}
              className="text-violet-600 font-medium hover:underline"
            >
              Go to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2]">
      <div className="text-center max-w-sm px-6">
        {joining && <p className="text-warm-gray-500">Joining group...</p>}
        {joined && (
          <>
            {preview && (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mx-auto mb-4"
                style={{ backgroundColor: preview.color }}
              >
                {preview.name.charAt(0).toUpperCase()}
              </div>
            )}
            <p className="text-green-600 font-semibold">Joined {preview?.name}! Redirecting...</p>
          </>
        )}
        {error && (
          <div>
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => router.push("/")}
              className="text-violet-600 font-medium hover:underline"
            >
              Go to dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
