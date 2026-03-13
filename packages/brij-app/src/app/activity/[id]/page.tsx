"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import QRCode from "react-qr-code";

interface Activity {
  id: string;
  title: string;
  description: string | null;
  status: string;
  shareCode: string;
  coordinatorId: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  isRecurring: boolean;
  recurringFrequency: string | null;
  seriesId: string | null;
}

interface Attendee {
  id: string;
  name: string;
  status: "coming" | "checked_in";
  rsvpAt: string;
  checkedInAt: string | null;
  isGuest: boolean;
}

function formatDateTime(startsAt: string | null) {
  if (!startsAt) return null;
  const d = new Date(startsAt);
  const date = d.toLocaleDateString();
  const hours = d.getHours();
  const mins = d.getMinutes();
  if (hours === 0 && mins === 0) return date;
  return `${date} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function isLive(startsAt: string | null): boolean {
  if (!startsAt) return false;
  const start = new Date(startsAt).getTime();
  const now = Date.now();
  const hourBefore = start - 60 * 60 * 1000;
  const fourHoursAfter = start + 4 * 60 * 60 * 1000;
  return now >= hourBefore && now <= fourHoursAfter;
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

function toLocalDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

function toLocalTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return "";
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${m.toString().padStart(2, "0")} ${period}`;
}

export default function ActivityDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { status } = useSession();
  const authenticated = status === "authenticated";
  const [activity, setActivity] = useState<Activity | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "", date: "", time: "", location: "" });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [nextActivityId, setNextActivityId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/activities/${id}`)
      .then((r) => r.json())
      .then(setActivity);
    fetch(`/api/activities/${id}/attendees`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAttendees(data);
      });
  }, [id]);

  useEffect(() => {
    if (authenticated) {
      fetch("/api/me")
        .then((r) => r.json())
        .then((data) => { if (data.id) setCurrentUserId(data.id); });
    }
  }, [authenticated]);

  function startEditing() {
    if (!activity) return;
    setEditForm({
      title: activity.title,
      description: activity.description || "",
      date: toLocalDate(activity.startsAt),
      time: toLocalTime(activity.startsAt),
      location: activity.location || "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    setEditError(null);
    const time = parseTime(editForm.time);
    let startsAt: string | null = null;
    const dateStr = editForm.date || (time ? new Date().toISOString().split("T")[0] : null);
    if (dateStr) {
      const [hours, minutes] = time ? time.split(":").map(Number) : [12, 0];
      const d = new Date(`${dateStr}T00:00`);
      d.setHours(hours, minutes, 0, 0);
      startsAt = d.toISOString();
    }

    const body = {
      title: editForm.title,
      description: editForm.description || null,
      startsAt,
      location: editForm.location || null,
    };

    const res = await fetch(`/api/activities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const updated = await res.json();
      setActivity(updated);
      setEditing(false);
    } else {
      const err = await res.json().catch(() => null);
      setEditError(err?.error || `Save failed (${res.status})`);
    }
    setSaving(false);
  }

  if (!activity) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-warm-gray-500">Loading...</p>
      </div>
    );
  }

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/join/${activity.shareCode}`
      : "";

  const live = isLive(activity.startsAt);
  const isCoordinator = currentUserId === activity.coordinatorId;

  function copyLink() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function toggleStatus() {
    const newStatus = activity!.status === "open" ? "closed" : "open";
    const res = await fetch(`/api/activities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.nextActivity) {
        setActivity({ ...data, nextActivity: undefined });
        setNextActivityId(data.nextActivity.id);
      } else {
        setActivity(data);
      }
    }
  }

  async function checkInAttendee(attendanceId: string) {
    try {
      const res = await fetch(`/api/activities/${id}/attendees`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendanceId, status: "checked_in" }),
      });
      if (res.ok) {
        setAttendees((prev) =>
          prev.map((a) =>
            a.id === attendanceId
              ? { ...a, status: "checked_in", checkedInAt: new Date().toISOString() }
              : a
          )
        );
      } else {
        const err = await res.json().catch(() => null);
        alert(`Check-in failed: ${err?.error || res.statusText}`);
      }
    } catch {
      alert("Check-in failed — network error");
    }
  }

  const formatted = formatDateTime(activity.startsAt);
  const coming = attendees.filter((a) => a.status === "coming");
  const checkedIn = attendees.filter((a) => a.status === "checked_in");

  return (
    <div className="min-h-screen">
      <header className="border-b border-warm-gray-200">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <span className="text-lg font-bold text-bark-900">Brij</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <button
          onClick={() => router.push("/")}
          className="text-sm text-warm-gray-500 hover:text-bark-900 mb-6"
        >
          &larr; Dashboard
        </button>

        {editing ? (
          <div className="mb-8 p-4 border border-warm-gray-200 rounded-lg space-y-4">
            <div>
              <label className="block text-sm font-medium text-bark-900 mb-1">Title</label>
              <input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:border-terracotta-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-bark-900 mb-1">Description</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:border-terracotta-400 resize-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-bark-900 mb-1">Date</label>
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:border-terracotta-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-bark-900 mb-1">Time</label>
                <input
                  type="text"
                  value={editForm.time}
                  onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                  placeholder="5:30 PM"
                  className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:border-terracotta-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-bark-900 mb-1">Location</label>
                <input
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  placeholder="Central Park"
                  className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg focus:outline-none focus:border-terracotta-400"
                />
              </div>
            </div>
            {editError && (
              <p className="text-sm text-red-600">{editError}</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={saveEdit}
                disabled={saving || !editForm.title.trim()}
                className="px-4 py-2 bg-terracotta-500 text-cream rounded-lg text-sm font-medium hover:bg-terracotta-600 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 text-sm text-warm-gray-500 hover:text-bark-900"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-bark-900">
                  {activity.title}
                </h1>
                {isCoordinator && (
                  <button
                    onClick={startEditing}
                    className="text-xs text-warm-gray-400 hover:text-bark-900"
                  >
                    Edit
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                {live && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full uppercase tracking-wide">
                    <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />
                    Live
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    activity.status === "open"
                      ? "bg-green-100 text-green-700"
                      : "bg-warm-gray-200 text-warm-gray-500"
                  }`}
                >
                  {activity.status}
                </span>
              </div>
            </div>

            <div className="flex items-start justify-between mb-8">
              <div>
                {activity.description && (
                  <p className="text-warm-gray-500 mt-1">{activity.description}</p>
                )}
                {(formatted || activity.location || activity.isRecurring) && (
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-warm-gray-500 mt-2">
                    {formatted && <span>{formatted}</span>}
                    {activity.location && <span>{activity.location}</span>}
                    {activity.isRecurring && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                        {activity.recurringFrequency === "weekly" ? "Every week" :
                         activity.recurringFrequency === "biweekly" ? "Every 2 weeks" : "Every month"}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0 ml-4">
                <button
                  onClick={copyLink}
                  className="px-3 py-2 text-sm bg-terracotta-500 text-cream rounded-lg hover:bg-terracotta-600 transition-colors whitespace-nowrap"
                >
                  {copied ? "Copied!" : "Share link"}
                </button>
                <p className="text-xs text-warm-gray-400 mt-1">
                  Anyone can join —<br />no account required.
                </p>
              </div>
            </div>
          </>
        )}

        {/* QR Code section */}
        {isCoordinator && activity.status === "open" && (
          <div className="mb-6">
            <button
              onClick={() => setShowQR(!showQR)}
              className="text-sm text-warm-gray-500 hover:text-bark-900 font-medium"
            >
              {showQR ? "Hide QR code" : "Show QR code for check-in"}
            </button>
            {showQR && (
              <div className="mt-3 p-4 bg-white border border-warm-gray-200 rounded-lg text-center">
                <div className="bg-white p-3 inline-block rounded-lg">
                  <QRCode value={shareUrl} size={160} />
                </div>
                <p className="text-sm text-warm-gray-500 mt-2">
                  {live ? "Show this at the event" : "Post this where people can scan"}
                </p>
                <p className="text-xs text-warm-gray-400 mt-1">
                  People scan to {live ? "check in" : "RSVP"}. No account needed.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Who's here (live mode) */}
        {live && checkedIn.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-green-600 mb-3">
              Who&apos;s here ({checkedIn.length})
            </h3>
            <div className="space-y-2">
              {checkedIn.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between py-2 px-3 bg-white border border-warm-gray-200 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-bark-900">{a.name}</span>
                    {a.isGuest && (
                      <span className="text-xs text-warm-gray-400">(guest)</span>
                    )}
                  </div>
                  <span className="text-xs text-green-600 font-medium">
                    Checked in
                    {a.checkedInAt && (
                      <> · {new Date(a.checkedInAt).toLocaleTimeString([], {
                        hour: "numeric",
                        minute: "2-digit",
                      })}</>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {coming.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-bark-900 mb-3">
              {live ? "Expected" : "Coming"} ({coming.length})
            </h3>
            <div className="space-y-2">
              {coming.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between py-2 px-3 bg-white border border-warm-gray-200 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-bark-900">{a.name}</span>
                    {a.isGuest && (
                      <span className="text-xs text-warm-gray-400">(guest)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-warm-gray-400">
                      {live ? "RSVP'd" : `RSVP ${new Date(a.rsvpAt).toLocaleDateString()}`}
                    </span>
                    {isCoordinator && live && (
                      <button
                        onClick={() => checkInAttendee(a.id)}
                        className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                      >
                        Check in
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Non-live checked in section */}
        {!live && (
          <div className="mb-6">
            <h3 className="text-sm font-medium text-bark-900 mb-3">
              Checked in ({checkedIn.length})
            </h3>
            {checkedIn.length === 0 ? (
              <p className="text-sm text-warm-gray-400">No one checked in yet.</p>
            ) : (
              <div className="space-y-2">
                {checkedIn.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between py-2 px-3 bg-white border border-warm-gray-200 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-bark-900">{a.name}</span>
                      {a.isGuest && (
                        <span className="text-xs text-warm-gray-400">(guest)</span>
                      )}
                    </div>
                    <span className="text-xs text-warm-gray-400">
                      {a.checkedInAt &&
                        new Date(a.checkedInAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {nextActivityId && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800 font-medium">Next occurrence created</p>
            <button
              onClick={() => router.push(`/activity/${nextActivityId}`)}
              className="text-sm text-blue-600 hover:text-blue-800 mt-1"
            >
              View next activity &rarr;
            </button>
          </div>
        )}

        {isCoordinator && (
          <button
            onClick={toggleStatus}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              activity.status === "open"
                ? "bg-warm-gray-200 text-bark-900 hover:bg-warm-gray-400"
                : "bg-terracotta-500 text-cream hover:bg-terracotta-600"
            }`}
          >
            {activity.status === "open"
              ? (activity.isRecurring ? "Close & create next" : "Close activity")
              : "Reopen activity"}
          </button>
        )}
      </main>
    </div>
  );
}
