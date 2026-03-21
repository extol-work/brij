"use client";

import { useSession, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { BrijLogo } from "@/components/brij-logo";

function NewActivityInner() {
  const { status } = useSession();
  const authenticated = status === "authenticated";
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = searchParams.get("groupId");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState("weekly");
  const [isPrivate, setIsPrivate] = useState(false);

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-warm-gray-500 mb-4">Sign in to create an activity.</p>
          <button onClick={() => signIn()} className="px-4 py-2 bg-terracotta-500 text-cream rounded-lg font-medium">
            Sign in
          </button>
        </div>
      </div>
    );
  }

  function parseTime(input: string): string | null {
    const s = input.trim().toLowerCase();
    if (!s) return null;
    const match = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const period = match[3];
    if (period === "pm" && hours < 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    if (hours > 23 || minutes > 59) return null;
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);

    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      title: form.get("title"),
      description: form.get("description") || undefined,
      location: form.get("location") || undefined,
      groupId: groupId || undefined,
      isRecurring,
      recurringFrequency: isRecurring ? recurringFrequency : undefined,
      isPrivate: groupId ? isPrivate : false,
      startsAt: (() => {
        const date = form.get("date") as string;
        const time = parseTime((form.get("time") as string) || "");
        const dateStr = date || (time ? new Date().toISOString().split("T")[0] : null);
        if (!dateStr) return undefined;
        const [hours, minutes] = time ? time.split(":").map(Number) : [12, 0];
        const d = new Date(`${dateStr}T00:00`);
        d.setHours(hours, minutes, 0, 0);
        return d.toISOString();
      })(),
    };

    setError(null);
    const res = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const activity = await res.json();
      router.push(`/activity/${activity.id}`);
    } else {
      const data = await res.json().catch(() => null);
      setError(data?.error || "Failed to create activity");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-warm-gray-200">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <BrijLogo />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <button onClick={() => router.back()} className="text-sm text-warm-gray-500 hover:text-bark-900 mb-6">
          &larr; Back
        </button>
        <h1 className="text-2xl font-semibold text-bark-900 mb-8">Create an activity</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-bark-900 mb-1">
              Title
            </label>
            <input
              id="title"
              name="title"
              required
              placeholder="Saturday cleanup"
              className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:border-terracotta-400"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-bark-900 mb-1">
              Description (optional)
            </label>
            <textarea
              id="description"
              name="description"
              rows={3}
              placeholder="What's this activity about?"
              className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:border-terracotta-400 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-bark-900 mb-1">
                Date
              </label>
              <input
                id="date"
                name="date"
                type="date"
                className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:border-terracotta-400"
              />
            </div>
            <div>
              <label htmlFor="time" className="block text-sm font-medium text-bark-900 mb-1">
                Time
              </label>
              <input
                id="time"
                name="time"
                type="text"
                placeholder="5:30 PM"
                className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:border-terracotta-400"
              />
            </div>
            <div>
              <label htmlFor="location" className="block text-sm font-medium text-bark-900 mb-1">
                Location
              </label>
              <input
                id="location"
                name="location"
                placeholder="Central Park"
                className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:border-terracotta-400"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="recurring" className="text-sm font-medium text-bark-900">
              This repeats
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={isRecurring}
              onClick={() => setIsRecurring(!isRecurring)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isRecurring ? "bg-terracotta-500" : "bg-warm-gray-200"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isRecurring ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {isRecurring && (
            <div>
              <label className="block text-sm font-medium text-bark-900 mb-1">
                Frequency
              </label>
              <select
                value={recurringFrequency}
                onChange={(e) => setRecurringFrequency(e.target.value)}
                className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:border-terracotta-400 bg-white"
              >
                <option value="weekly">Every week</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Every month</option>
              </select>
            </div>
          )}

          {/* Private event toggle — group events only */}
          {groupId && (
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-bark-900">Private event</span>
                <p className="text-xs text-warm-gray-400">Only invited members can see this event</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPrivate}
                onClick={() => setIsPrivate(!isPrivate)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isPrivate ? "bg-terracotta-500" : "bg-warm-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isPrivate ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-terracotta-500 text-cream rounded-lg font-medium hover:bg-terracotta-600 transition-colors disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create activity"}
          </button>
        </form>
      </main>
    </div>
  );
}

export default function NewActivity() {
  return (
    <Suspense>
      <NewActivityInner />
    </Suspense>
  );
}
