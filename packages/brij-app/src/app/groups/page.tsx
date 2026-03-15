"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

interface Group {
  id: string;
  name: string;
  description: string | null;
  color: string;
  role: string;
}

export default function MyGroups() {
  const { status } = useSession();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/groups")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setGroups(data);
      })
      .finally(() => setLoading(false));
  }, [status]);

  if (status === "loading" || loading) return null;

  return (
    <div className="min-h-screen">
      <div className="flex items-center gap-2 px-4 py-4 border-b border-warm-gray-200">
        <Link href="/" className="text-base text-violet-600 cursor-pointer">
          &lsaquo; Back
        </Link>
        <h1 className="text-lg font-bold flex-1 text-center text-bark-900">My Groups</h1>
        <div className="w-10" />
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">
        {groups.map((g) => (
          <Link
            key={g.id}
            href={`/groups/${g.id}`}
            className="block bg-white border border-warm-gray-200 rounded-xl p-4 mb-3 hover:bg-cream/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold text-white shrink-0"
                style={{ backgroundColor: g.color }}
              >
                {g.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold text-bark-900">{g.name}</p>
                {g.description && (
                  <p className="text-[13px] text-warm-gray-500 mt-0.5 truncate">{g.description}</p>
                )}
              </div>
              <span className="text-base text-warm-gray-400">&rsaquo;</span>
            </div>
          </Link>
        ))}

        {groups.length === 0 && !showCreate && (
          <div className="text-center py-12">
            <p className="text-warm-gray-500 mb-4">No groups yet.</p>
          </div>
        )}

        {showCreate ? (
          <CreateGroupForm
            onCreated={(g) => {
              setGroups((prev) => [g, ...prev]);
              setShowCreate(false);
            }}
            onCancel={() => setShowCreate(false)}
          />
        ) : (
          <div className="text-center pt-4">
            <button
              onClick={() => setShowCreate(true)}
              className="px-6 py-3 bg-violet-600 text-white rounded-xl text-[15px] font-semibold hover:bg-violet-700 transition-colors"
            >
              + New group
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const GROUP_COLORS = [
  "#7c3aed", "#2563eb", "#059669", "#d97706", "#dc2626",
  "#0891b2", "#7c3aed", "#be185d", "#4f46e5", "#0d9488",
];

function CreateGroupForm({
  onCreated,
  onCancel,
}: {
  onCreated: (g: Group) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || null, color }),
    });

    if (res.ok) {
      const group = await res.json();
      onCreated({ ...group, role: "coordinator" });
    } else {
      const data = await res.json();
      setError(data.error || "Failed to create group");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-warm-gray-200 rounded-xl p-4 mb-3">
      <h3 className="text-base font-bold text-bark-900 mb-3">New Group</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-bark-900 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Riverside Trail Crew"
            className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-bark-900 mb-1">Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this group do?"
            className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-600"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-bark-900 mb-1">Color</label>
          <div className="flex gap-2">
            {GROUP_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full ${color === c ? "ring-2 ring-offset-2 ring-violet-600" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
          >
            {submitting ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-warm-gray-500 hover:text-bark-900"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
