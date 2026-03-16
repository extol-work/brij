"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const [me, setMe] = useState<{ id: string; email: string; displayName: string | null; consentedAt: string | null } | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/me")
      .then((r) => r.json())
      .then(setMe);
  }, [status]);

  if (status !== "authenticated" || !me) return null;

  async function handleExport() {
    setExporting(true);
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const url = `/api/export/activities${params.toString() ? "?" + params.toString() : ""}`;

    const res = await fetch(url);
    if (res.ok) {
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "my-activities.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    }
    setExporting(false);
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <div className="border-b border-warm-gray-200">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-2">
          <Link href="/" className="text-base text-violet-600">&lsaquo; Back</Link>
          <h1 className="text-lg font-bold flex-1 text-center text-bark-900">Settings</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-8">
        {/* Profile */}
        <div>
          <h2 className="text-sm font-semibold text-warm-gray-500 uppercase tracking-wide mb-3">Profile</h2>
          <div className="bg-white border border-warm-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-warm-gray-500">Name</span>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    autoFocus
                    className="px-2 py-1 border border-warm-gray-200 rounded-lg text-sm text-base w-40 focus:outline-none focus:ring-2 focus:ring-violet-600"
                  />
                  <button
                    onClick={async () => {
                      setSavingName(true);
                      const res = await fetch("/api/me", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: nameInput }),
                      });
                      if (res.ok) {
                        setMe({ ...me, displayName: nameInput.trim() || null });
                        setEditingName(false);
                      }
                      setSavingName(false);
                    }}
                    disabled={savingName}
                    className="text-xs text-violet-600 font-semibold"
                  >
                    {savingName ? "..." : "Save"}
                  </button>
                  <button onClick={() => setEditingName(false)} className="text-xs text-warm-gray-400">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setNameInput(me.displayName || ""); setEditingName(true); }}
                  className="text-sm text-bark-900 font-medium hover:text-violet-600 transition-colors"
                >
                  {me.displayName || "Not set"} <span className="text-warm-gray-400 text-xs ml-1">edit</span>
                </button>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-warm-gray-500">Email</span>
              <span className="text-sm text-bark-900 font-medium">{me.email}</span>
            </div>
            {me.consentedAt && (
              <div className="flex justify-between">
                <span className="text-sm text-warm-gray-500">Consented</span>
                <span className="text-sm text-warm-gray-400">{new Date(me.consentedAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Export */}
        <div>
          <h2 className="text-sm font-semibold text-warm-gray-500 uppercase tracking-wide mb-3">Export</h2>
          <div className="bg-white border border-warm-gray-200 rounded-xl p-4">
            <p className="text-sm text-bark-900 font-medium mb-1">Export my activities</p>
            <p className="text-xs text-warm-gray-400 mb-4">Download a CSV of every activity you coordinated or attended.</p>
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="block text-xs text-warm-gray-400 mb-1">From</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg text-base"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-warm-gray-400 mb-1">To</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg text-base"
                />
              </div>
            </div>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="w-full py-2.5 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
            >
              {exporting ? "Exporting..." : "Download CSV"}
            </button>
            <p className="text-xs text-warm-gray-400 mt-2 text-center">Leave dates blank for all time</p>
          </div>
        </div>

        {/* Account */}
        <div>
          <h2 className="text-sm font-semibold text-warm-gray-500 uppercase tracking-wide mb-3">Account</h2>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full py-2.5 border border-warm-gray-200 rounded-xl text-sm text-warm-gray-500 hover:text-red-500 hover:border-red-200 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
