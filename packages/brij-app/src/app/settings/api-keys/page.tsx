"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import Link from "next/link";

interface CoordGroup {
  id: string;
  name: string;
}

interface ApiKey {
  id: string;
  groupId: string;
  keyPrefix: string;
  label: string | null;
  expiresAt: string;
  createdAt: string;
}

export default function ApiKeysPage() {
  const { status } = useSession();
  const [groups, setGroups] = useState<CoordGroup[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  // Generate form
  const [selectedGroup, setSelectedGroup] = useState("");
  const [label, setLabel] = useState("");
  const [expiryDays, setExpiryDays] = useState(30);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  // Newly created key (shown once)
  const [newKey, setNewKey] = useState<{ rawKey: string; keyPrefix: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    loadKeys();
  }, [status]);

  async function loadKeys() {
    setLoading(true);
    const res = await fetch("/api/settings/api-keys");
    if (res.ok) {
      const data = await res.json();
      setGroups(data.groups);
      setKeys(data.keys);
      if (data.groups.length > 0 && !selectedGroup) {
        setSelectedGroup(data.groups[0].id);
      }
    }
    setLoading(false);
  }

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    setNewKey(null);

    const res = await fetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId: selectedGroup,
        label: label.trim() || undefined,
        expiryDays,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setNewKey({ rawKey: data.rawKey, keyPrefix: data.keyPrefix });
      setLabel("");
      await loadKeys();
    } else {
      const data = await res.json();
      setError(data.error || "Failed to generate key");
    }
    setGenerating(false);
  }

  async function handleRevoke(keyId: string) {
    setRevoking(keyId);
    const res = await fetch(`/api/settings/api-keys/${keyId}`, { method: "DELETE" });
    if (res.ok) {
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
    }
    setRevoking(null);
  }

  async function handleCopy() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey.rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (status !== "authenticated") return null;

  const groupName = (gid: string) => groups.find((g) => g.id === gid)?.name ?? "Unknown";
  const activeKeysForGroup = keys.filter((k) => k.groupId === selectedGroup);
  const isExpired = (d: string) => new Date(d) < new Date();

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <div className="border-b border-warm-gray-200">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-2">
          <Link href="/settings" className="text-base text-violet-600">&lsaquo; Settings</Link>
          <h1 className="text-lg font-bold flex-1 text-center text-bark-900">API Keys</h1>
          <div className="w-16" />
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-8">
        {loading ? (
          <p className="text-sm text-warm-gray-400 text-center py-8">Loading...</p>
        ) : groups.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-warm-gray-500 mb-1">No groups found</p>
            <p className="text-xs text-warm-gray-400">You need to be a coordinator of a group to create API keys.</p>
          </div>
        ) : (
          <>
            {/* Newly created key banner */}
            {newKey && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-green-800 mb-1">Key created</p>
                <p className="text-xs text-green-700 mb-3">
                  Copy this key now. You won&apos;t be able to see it again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white border border-green-200 rounded-lg px-3 py-2 font-mono break-all select-all text-bark-900">
                    {newKey.rawKey}
                  </code>
                  <button
                    onClick={handleCopy}
                    className="px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 shrink-0"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <button
                  onClick={() => setNewKey(null)}
                  className="mt-3 text-xs text-green-600 hover:text-green-800"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Generate new key */}
            <div>
              <h2 className="text-sm font-semibold text-warm-gray-500 uppercase tracking-wide mb-3">Generate a key</h2>
              <div className="bg-white border border-warm-gray-200 rounded-xl p-4 space-y-3">
                {groups.length > 1 && (
                  <div>
                    <label className="block text-xs text-warm-gray-400 mb-1">Group</label>
                    <select
                      value={selectedGroup}
                      onChange={(e) => setSelectedGroup(e.target.value)}
                      className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg text-sm text-bark-900 bg-white"
                    >
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-warm-gray-400 mb-1">Label (optional)</label>
                  <input
                    type="text"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. Discord bot"
                    maxLength={50}
                    className="w-full px-3 py-2 border border-warm-gray-200 rounded-lg text-sm text-bark-900 focus:outline-none focus:ring-2 focus:ring-violet-600"
                  />
                </div>

                <div>
                  <label className="block text-xs text-warm-gray-400 mb-1">Expires in</label>
                  <div className="flex gap-2">
                    {[1, 7, 30].map((d) => (
                      <button
                        key={d}
                        onClick={() => setExpiryDays(d)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          expiryDays === d
                            ? "bg-violet-600 text-white border-violet-600"
                            : "bg-white text-bark-900 border-warm-gray-200 hover:border-violet-300"
                        }`}
                      >
                        {d} day{d > 1 ? "s" : ""}
                      </button>
                    ))}
                  </div>
                </div>

                {error && <p className="text-xs text-red-600">{error}</p>}

                <button
                  onClick={handleGenerate}
                  disabled={generating || !selectedGroup || activeKeysForGroup.length >= 3}
                  className="w-full py-2.5 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
                >
                  {generating ? "Generating..." : "Generate key"}
                </button>

                {activeKeysForGroup.length >= 3 && (
                  <p className="text-xs text-warm-gray-400 text-center">
                    Maximum 3 active keys per group. Revoke one to create a new one.
                  </p>
                )}
              </div>
            </div>

            {/* Active keys */}
            <div>
              <h2 className="text-sm font-semibold text-warm-gray-500 uppercase tracking-wide mb-3">
                Active keys{groups.length === 1 ? "" : ` \u2014 ${groupName(selectedGroup)}`}
              </h2>
              {activeKeysForGroup.length === 0 ? (
                <div className="bg-white border border-warm-gray-200 rounded-xl p-4">
                  <p className="text-sm text-warm-gray-400 text-center">No active keys</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeKeysForGroup.map((k) => {
                    const expired = isExpired(k.expiresAt);
                    return (
                      <div
                        key={k.id}
                        className={`bg-white border rounded-xl p-4 ${
                          expired ? "border-red-200 bg-red-50/50" : "border-warm-gray-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <code className="text-xs font-mono text-bark-900">{k.keyPrefix}...</code>
                              {expired && (
                                <span className="text-[10px] font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                                  EXPIRED
                                </span>
                              )}
                            </div>
                            {k.label && (
                              <p className="text-xs text-warm-gray-500 mb-1">{k.label}</p>
                            )}
                            <p className="text-[11px] text-warm-gray-400">
                              Created {new Date(k.createdAt).toLocaleDateString()} &middot;{" "}
                              {expired
                                ? `Expired ${new Date(k.expiresAt).toLocaleDateString()}`
                                : `Expires ${new Date(k.expiresAt).toLocaleDateString()}`}
                            </p>
                          </div>
                          <button
                            onClick={() => handleRevoke(k.id)}
                            disabled={revoking === k.id}
                            className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0 py-1"
                          >
                            {revoking === k.id ? "..." : "Revoke"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Keys from other groups (if multi-group coordinator) */}
            {groups.length > 1 && (
              <div>
                <h2 className="text-sm font-semibold text-warm-gray-500 uppercase tracking-wide mb-3">All groups</h2>
                <div className="space-y-1">
                  {groups.map((g) => {
                    const count = keys.filter((k) => k.groupId === g.id).length;
                    return (
                      <button
                        key={g.id}
                        onClick={() => setSelectedGroup(g.id)}
                        className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${
                          selectedGroup === g.id
                            ? "bg-violet-50 text-violet-700 font-medium"
                            : "bg-white text-bark-900 hover:bg-warm-gray-50"
                        } border border-warm-gray-200`}
                      >
                        {g.name}
                        <span className="text-warm-gray-400 ml-2 text-xs">{count} key{count !== 1 ? "s" : ""}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
