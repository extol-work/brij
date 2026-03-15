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

        {groups.length === 0 && (
          <div className="text-center py-12">
            <p className="text-warm-gray-500 mb-4">No groups yet.</p>
          </div>
        )}

        <div className="text-center pt-4">
          <Link
            href="/groups/new"
            className="inline-block px-6 py-3 bg-violet-600 text-white rounded-xl text-[15px] font-semibold hover:bg-violet-700 transition-colors"
          >
            + New group
          </Link>
        </div>
      </div>
    </div>
  );
}
