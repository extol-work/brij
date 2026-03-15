"use client";

import { useSession, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function JoinGroup() {
  const { code } = useParams<{ code: string }>();
  const { status } = useSession();
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    setJoining(true);
    fetch("/api/groups/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.groupId) {
          setJoined(true);
          setTimeout(() => router.push(`/groups/${data.groupId}`), 1500);
        } else if (data.error === "Already a member") {
          router.push(`/groups/${data.groupId}`);
        } else {
          setError(data.error || "Failed to join");
        }
      })
      .finally(() => setJoining(false));
  }, [code, status, router]);

  if (status === "loading") return null;

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <h1 className="text-4xl font-bold text-bark-900 mb-2">brij</h1>
          <p className="text-warm-gray-500 mb-6">
            You&apos;ve been invited to join a group. Sign in to continue.
          </p>
          <button
            onClick={() => signIn(undefined, { callbackUrl: `/groups/join/${code}` })}
            className="px-6 py-3 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition-colors"
          >
            Sign in to join
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center max-w-sm px-6">
        {joining && <p className="text-warm-gray-500">Joining group...</p>}
        {joined && <p className="text-green-600 font-semibold">Joined! Redirecting...</p>}
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
