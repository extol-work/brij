"use client";

import { useState, useEffect, useRef } from "react";

interface MemberResult {
  id: string;
  displayName: string;
}

interface SelectedMember {
  id: string;
  displayName: string;
}

export function MemberSearch({
  groupId,
  selected,
  onSelect,
  onRemove,
}: {
  groupId: string;
  selected: SelectedMember[];
  onSelect: (member: SelectedMember) => void;
  onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MemberResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searched, setSearched] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      setSearched(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearched(true);
      const res = await fetch(`/api/groups/${groupId}/members/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data: MemberResult[] = await res.json();
        // Filter out already selected
        const filtered = data.filter((m) => !selected.some((s) => s.id === m.id));
        setResults(filtered);
        setOpen(true);
        setHighlightIndex(0);
      }
    }, 200);

    return () => clearTimeout(debounceRef.current);
  }, [query, groupId, selected]);

  function handleSelect(member: MemberResult) {
    onSelect({ id: member.id, displayName: member.displayName });
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(results[highlightIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="text-xs font-semibold text-warm-gray-500 mb-1 block">
        Who helped?
      </label>
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border border-warm-gray-200 rounded-lg bg-white min-h-[40px]">
        {/* Selected chips */}
        {selected.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200"
          >
            <span
              className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[8px] font-semibold text-white shrink-0"
              style={{ backgroundColor: "#7c3aed" }}
            >
              {m.displayName.charAt(0).toUpperCase()}
            </span>
            {m.displayName}
            <button
              onClick={() => onRemove(m.id)}
              className="text-violet-400 hover:text-violet-700 ml-0.5 text-sm leading-none"
            >
              &times;
            </button>
          </span>
        ))}

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder={selected.length === 0 ? "@add collaborators..." : "@add..."}
          className="flex-1 min-w-[100px] text-sm bg-transparent outline-none placeholder-warm-gray-400 text-bark-900"
        />
      </div>
      <p className="text-[11px] text-warm-gray-400 mt-1">They&apos;ll be asked to sign</p>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-violet-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.length > 0 ? results.map((m, i) => (
            <button
              key={m.id}
              onClick={() => handleSelect(m)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-violet-50 transition-colors ${
                i === highlightIndex ? "bg-violet-50" : ""
              }`}
            >
              <span
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white shrink-0"
                style={{ backgroundColor: "#7c3aed" }}
              >
                {m.displayName.charAt(0).toUpperCase()}
              </span>
              <span className="text-sm font-medium text-bark-900">{m.displayName}</span>
            </button>
          )) : searched && (
            <div className="px-3 py-3 text-center">
              <p className="text-sm text-warm-gray-500 font-medium">No member found</p>
              <p className="text-xs text-warm-gray-400 mt-0.5">Only members of this group can be tagged</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
