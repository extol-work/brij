"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import QRCode from "react-qr-code";
import { firstName, initial } from "@/lib/names";
import { resizeImage } from "@/lib/resize-image";

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
  summary: string | null;
  sentiment: string | null;
  closedAt: string | null;
  createdAt: string;
  photoUrl: string | null;
  groupId: string | null;
  groupName?: string | null;
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

function isLive(activity: Activity | null): boolean {
  if (!activity || activity.status !== "open" || !activity.startsAt) return false;
  const start = new Date(activity.startsAt).getTime();
  const now = Date.now();
  if (activity.endsAt) {
    const end = new Date(activity.endsAt).getTime();
    return now >= start && now <= end;
  }
  const hourBefore = start - 60 * 60 * 1000;
  const fourHoursAfter = start + 4 * 60 * 60 * 1000;
  return now >= hourBefore && now <= fourHoursAfter;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m ago`;
}

function timeUntil(date: string): string {
  const diff = new Date(date).getTime() - Date.now();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins} minutes`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
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
  const [inlineTitle, setInlineTitle] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [showOnBehalf, setShowOnBehalf] = useState(false);
  const [walkUpName, setWalkUpName] = useState("");
  const [addingWalkUp, setAddingWalkUp] = useState(false);
  const [showClosure, setShowClosure] = useState(false);
  const [closureSentiment, setClosureSentiment] = useState<string | null>(null);
  const [closureText, setClosureText] = useState("");
  const [postingSummary, setPostingSummary] = useState(false);
  const closureRef = useRef<HTMLDivElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (showClosure && closureRef.current) {
      closureRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [showClosure]);

  // Auto-show inline title edit for "Untitled activity"
  useEffect(() => {
    if (!activity || !currentUserId) return;
    if (activity.title === "Untitled activity" && currentUserId === activity.coordinatorId) {
      setInlineTitle(activity.title);
      setTimeout(() => titleInputRef.current?.focus(), 100);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity?.title, currentUserId]);

  async function saveInlineTitle() {
    if (!inlineTitle?.trim() || inlineTitle === activity?.title) {
      setInlineTitle(null);
      return;
    }
    setSavingTitle(true);
    const res = await fetch(`/api/activities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: inlineTitle.trim() }),
    });
    if (res.ok) {
      const updated = await res.json();
      setActivity(updated);
    }
    setSavingTitle(false);
    setInlineTitle(null);
  }

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

  const live = isLive(activity);
  const isCoordinator = currentUserId === activity.coordinatorId;
  const isNowActivity = activity.endsAt !== null;
  const autoCloseWarning = isNowActivity && activity.endsAt && live &&
    (new Date(activity.endsAt).getTime() - Date.now()) < 60 * 60 * 1000;

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

  async function addWalkUp() {
    if (!walkUpName.trim()) return;
    setAddingWalkUp(true);
    const res = await fetch(`/api/activities/${id}/attendees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ guestName: walkUpName.trim() }),
    });
    if (res.ok) {
      const attendance = await res.json();
      setAttendees((prev) => [
        ...prev,
        {
          id: attendance.id,
          name: walkUpName.trim(),
          status: "checked_in",
          rsvpAt: new Date().toISOString(),
          checkedInAt: new Date().toISOString(),
          isGuest: true,
        },
      ]);
      setWalkUpName("");
    }
    setAddingWalkUp(false);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const resized = await resizeImage(file);
      const formData = new FormData();
      formData.append("photo", resized, "photo.jpg");
      const res = await fetch(`/api/activities/${id}/photo`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        setActivity((prev) => prev ? { ...prev, photoUrl: data.photoUrl } : prev);
      }
    } catch {
      alert("Photo upload failed");
    }
    setUploadingPhoto(false);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  async function removePhoto() {
    setUploadingPhoto(true);
    const res = await fetch(`/api/activities/${id}/photo`, { method: "DELETE" });
    if (res.ok) {
      setActivity((prev) => prev ? { ...prev, photoUrl: null } : prev);
    }
    setUploadingPhoto(false);
  }

  const sentimentOptions = [
    { key: "exhilarating", emoji: "\u26A1", label: "Exhilarating!" },
    { key: "great_company", emoji: "\uD83E\uDD1D", label: "Great company" },
    { key: "complete", emoji: "\u2713", label: "Complete" },
  ];

  function handleSentimentTap(key: string) {
    if (closureSentiment === key) {
      setClosureSentiment(null);
    } else {
      setClosureSentiment(key);
      const opt = sentimentOptions.find((o) => o.key === key);
      if (opt && !closureText) setClosureText(opt.label);
    }
  }

  async function postSummary() {
    setPostingSummary(true);
    const summaryText = closureText.trim() || null;
    const res = await fetch(`/api/activities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: summaryText,
        sentiment: closureSentiment,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.nextActivity) {
        setActivity({ ...data, nextActivity: undefined });
        setNextActivityId(data.nextActivity.id);
      } else {
        setActivity(data);
      }
      setShowClosure(false);
    }
    setPostingSummary(false);
  }

  const formatted = formatDateTime(activity.startsAt);
  const coming = attendees.filter((a) => a.status === "coming");
  const checkedIn = attendees.filter((a) => a.status === "checked_in");
  const needsClosure = isCoordinator && activity.status === "closed" && !activity.summary;
  const hasSummary = !!activity.summary;

  return (
    <div className="min-h-screen">
      <header className="border-b border-warm-gray-200">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <span className="text-2xl font-bold text-bark-900">brij</span><span className="text-base text-warm-gray-400 font-light ml-1.5">by Extol</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <button
          onClick={() => router.push(activity.groupId ? `/groups/${activity.groupId}` : "/")}
          className="text-sm text-warm-gray-500 hover:text-bark-900 mb-6"
        >
          &larr; {activity.groupId && activity.groupName ? activity.groupName : "Dashboard"}
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
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {inlineTitle !== null ? (
                  <input
                    ref={titleInputRef}
                    value={inlineTitle}
                    onChange={(e) => setInlineTitle(e.target.value)}
                    onBlur={saveInlineTitle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveInlineTitle();
                      if (e.key === "Escape") setInlineTitle(null);
                    }}
                    placeholder="Name this activity..."
                    disabled={savingTitle}
                    className="text-3xl font-bold text-bark-900 bg-transparent border-b-2 border-violet-400 focus:outline-none w-full"
                  />
                ) : (
                  <>
                    <h1
                      className={`text-3xl font-bold text-bark-900 ${isCoordinator ? "cursor-pointer hover:text-violet-700 transition-colors" : ""}`}
                      onClick={isCoordinator ? () => setInlineTitle(activity.title) : undefined}
                    >
                      {activity.title}
                    </h1>
                    {activity.groupName && activity.groupId && (
                      <a href={`/groups/${activity.groupId}`} className="text-sm text-violet-600 hover:underline mt-1 inline-block">
                        {activity.groupName}
                      </a>
                    )}
                  </>
                )}
                {isCoordinator && inlineTitle === null && (
                  <button
                    onClick={startEditing}
                    className="text-xs text-warm-gray-400 hover:text-bark-900 shrink-0"
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

        {/* Photo upload — coordinator only */}
        {isCoordinator && (
          <div className="mb-6">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            {activity.photoUrl ? (
              <div className="relative rounded-xl overflow-hidden">
                <img
                  src={activity.photoUrl}
                  alt="Activity photo"
                  className="w-full h-48 object-cover"
                />
                <div className="absolute bottom-2 right-2 flex gap-2">
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="px-3 py-1.5 bg-black/60 text-white text-xs rounded-lg hover:bg-black/80 transition-colors disabled:opacity-50"
                  >
                    {uploadingPhoto ? "..." : "Replace"}
                  </button>
                  <button
                    onClick={removePhoto}
                    disabled={uploadingPhoto}
                    className="px-3 py-1.5 bg-black/60 text-white text-xs rounded-lg hover:bg-black/80 transition-colors disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="w-full py-4 border-2 border-dashed border-warm-gray-200 rounded-xl text-warm-gray-400 font-medium flex items-center justify-center gap-2 hover:border-violet-300 hover:text-violet-500 transition-colors disabled:opacity-50"
              >
                {uploadingPhoto ? "Uploading..." : "Add photo"}
              </button>
            )}
          </div>
        )}

        {/* Auto-close warning banner */}
        {autoCloseWarning && activity.endsAt && (
          <div className="mb-6 flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800">
            <span className="text-lg shrink-0">⏱</span>
            <div>
              <p className="text-sm font-semibold">This activity closes in {timeUntil(activity.endsAt)}</p>
              <p className="text-xs mt-0.5">After 12 hours, it&apos;ll close automatically.</p>
            </div>
          </div>
        )}

        {/* Live mode: QR + share link always visible */}
        {live && (
          <div className="mb-6">
            <div className="live-header flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-sm font-semibold text-green-600">Live</span>
              </div>
              <span className="text-xs text-warm-gray-400">
                Started {activity.startsAt ? timeAgo(activity.startsAt) : ""}
                {isNowActivity && activity.endsAt && !autoCloseWarning && (
                  <> · Auto-closes in {timeUntil(activity.endsAt)}</>
                )}
              </span>
            </div>

            <div className="bg-warm-gray-50 border border-warm-gray-200 rounded-xl p-6 text-center mb-4">
              <div className="bg-white p-3 inline-block rounded-lg">
                <QRCode value={shareUrl} size={160} />
              </div>
              <p className="text-sm text-warm-gray-500 font-medium mt-3">Scan to check in</p>
              <p className="text-xs text-warm-gray-400 mt-1">Or share the link below</p>
            </div>

            <div className="flex gap-2 mb-6">
              <input
                value={shareUrl}
                readOnly
                className="flex-1 px-3 py-2.5 bg-warm-gray-50 border border-warm-gray-200 rounded-lg text-sm text-warm-gray-500"
              />
              <button
                onClick={copyLink}
                className="px-4 py-2.5 border border-warm-gray-200 rounded-lg text-sm font-medium hover:border-warm-gray-400 transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* Non-live QR toggle */}
        {!live && activity.status === "open" && (
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
                <p className="text-sm text-warm-gray-500 mt-2">Post this where people can scan</p>
                <p className="text-xs text-warm-gray-400 mt-1">
                  People scan to RSVP. No account needed.
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
                    <span className="text-sm text-bark-900">{firstName(a.name)}</span>
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
                    <span className="text-sm text-bark-900">{firstName(a.name)}</span>
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
                      <span className="text-sm text-bark-900">{firstName(a.name)}</span>
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

        {/* On-behalf check-in panel */}
        {isCoordinator && live && (
          <div className="mb-6">
            {!showOnBehalf ? (
              <button
                onClick={() => setShowOnBehalf(true)}
                className="w-full py-3 border-2 border-dashed border-warm-gray-200 rounded-xl text-warm-gray-500 font-medium flex items-center justify-center gap-2 hover:border-warm-gray-400 transition-colors"
              >
                + Check someone in
              </button>
            ) : (
              <div className="bg-warm-gray-50 border border-warm-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-bark-900">Check someone in</h4>
                  <button
                    onClick={() => setShowOnBehalf(false)}
                    className="text-xs text-warm-gray-400 hover:text-bark-900"
                  >
                    Close
                  </button>
                </div>
                <p className="text-xs text-warm-gray-500 mb-3">
                  For people without their phone, kids, or walk-ups.
                </p>

                {/* Existing RSVPs not yet checked in */}
                {coming.length > 0 && (
                  <div className="mb-3">
                    {coming.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => checkInAttendee(a.id)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white transition-colors text-left"
                      >
                        <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-semibold shrink-0">
                          {initial(a.name)}
                        </span>
                        <span className="text-sm font-medium text-bark-900 flex-1">{firstName(a.name)}</span>
                        <span className="text-xs text-warm-gray-400">Not checked in</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Walk-up name input */}
                <div className="flex gap-2">
                  <input
                    value={walkUpName}
                    onChange={(e) => setWalkUpName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addWalkUp()}
                    placeholder="Add a name (walk-up)..."
                    className="flex-1 px-3 py-2 border border-warm-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:border-violet-400"
                  />
                  <button
                    onClick={addWalkUp}
                    disabled={!walkUpName.trim() || addingWalkUp}
                    className="px-3 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors disabled:opacity-50"
                  >
                    {addingWalkUp ? "..." : "Add"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Summary display */}
        {hasSummary && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-xl">
            <p className="text-sm font-semibold text-green-600 uppercase tracking-wide mb-2">Summary</p>
            <div className="flex items-start gap-3">
              {activity.sentiment && (
                <span className="text-3xl shrink-0">
                  {sentimentOptions.find((o) => o.key === activity.sentiment)?.emoji}
                </span>
              )}
              <p className="text-base text-bark-900 leading-relaxed">{activity.summary}</p>
            </div>
            {isCoordinator && (
              <button
                onClick={() => {
                  setClosureText(activity.summary || "");
                  setClosureSentiment(activity.sentiment || null);
                  setShowClosure(true);
                }}
                className="text-xs text-warm-gray-400 hover:text-bark-900 mt-2"
              >
                Edit summary
              </button>
            )}
          </div>
        )}

        {/* Photo-first closure prompt — coordinator, closed, no summary */}
        {needsClosure && !showClosure && (
          <div className="mb-6 p-5 bg-violet-50 border-2 border-violet-200 rounded-xl">
            {!activity.photoUrl && (
              <>
                <div className="text-center mb-4">
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="w-20 h-20 mx-auto rounded-2xl bg-violet-100 border-2 border-violet-300 flex items-center justify-center text-3xl text-violet-500 hover:bg-violet-200 transition-colors disabled:opacity-50"
                  >
                    {uploadingPhoto ? "..." : "\uD83D\uDCF7"}
                  </button>
                  <p className="text-sm font-semibold text-bark-900 mt-3">Add a photo from today</p>
                  <p className="text-xs text-warm-gray-400 mt-1">Makes your Extol Card look great</p>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-warm-gray-200" />
                  <span className="text-xs text-warm-gray-400">then</span>
                  <div className="flex-1 h-px bg-warm-gray-200" />
                </div>
              </>
            )}
            <h3 className="text-lg font-bold text-bark-900 mb-1">How&apos;d it go?</h3>
            <p className="text-sm text-warm-gray-500 mb-4">
              {activity.title} &middot; {checkedIn.length} checked in
            </p>
            <button
              onClick={() => setShowClosure(true)}
              className="w-full py-3 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition-colors"
            >
              Add summary
            </button>
          </div>
        )}

        {/* Closure dialog */}
        {showClosure && (
          <div ref={closureRef} className="mb-6 p-5 bg-white border border-warm-gray-200 rounded-xl shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-bold text-bark-900">How&apos;d it go?</h3>
              <button
                onClick={() => setShowClosure(false)}
                className="text-warm-gray-400 hover:text-bark-900 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <p className="text-sm text-warm-gray-500 mb-4">
              {activity.title} &middot; {checkedIn.length} checked in
            </p>

            {/* Quick-tap sentiment buttons */}
            <div className="flex gap-2 mb-4">
              {sentimentOptions.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => handleSentimentTap(opt.key)}
                  className={`flex-1 py-3 px-2 rounded-xl border-2 text-center transition-all ${
                    closureSentiment === opt.key
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-warm-gray-200 hover:border-violet-300 hover:bg-violet-50"
                  }`}
                >
                  <span className="block text-2xl mb-1">{opt.emoji}</span>
                  <span className="text-sm font-semibold">{opt.label}</span>
                </button>
              ))}
            </div>

            {/* Text field */}
            <textarea
              value={closureText}
              onChange={(e) => setClosureText(e.target.value)}
              placeholder="What happened? (optional)"
              rows={3}
              className="w-full px-3 py-3 border border-warm-gray-200 rounded-xl text-sm focus:outline-none focus:border-violet-400 resize-none mb-4"
            />

            {/* Submit */}
            <button
              onClick={postSummary}
              disabled={postingSummary || (!closureText.trim() && !closureSentiment)}
              className="w-full py-3 bg-violet-600 text-white rounded-xl font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50"
            >
              {postingSummary ? "Posting..." : "Post summary"}
            </button>
          </div>
        )}

        {/* Extol Card button — shown for closed activities with attendees */}
        {activity.status === "closed" && checkedIn.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => router.push(`/card/${activity.id}`)}
              className="w-full py-4 bg-violet-600 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 hover:bg-violet-700 transition-colors shadow-[0_4px_20px_rgba(124,58,237,0.2)]"
            >
              View Extol Card
            </button>
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

        {isCoordinator && activity.status === "open" && (
          <button
            onClick={async () => {
              const res = await fetch(`/api/activities/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "closed" }),
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
            }}
            className="w-full py-3 rounded-lg font-medium transition-colors bg-warm-gray-200 text-bark-900 hover:bg-warm-gray-400"
          >
            {activity.isRecurring ? "Close & create next" : "Close activity"}
          </button>
        )}
        {isCoordinator && activity.status === "closed" && (
          <button
            onClick={toggleStatus}
            className="w-full py-3 rounded-lg font-medium transition-colors bg-terracotta-500 text-cream hover:bg-terracotta-600"
          >
            Reopen activity
          </button>
        )}
      </main>
    </div>
  );
}
