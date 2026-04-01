"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@/lib/posthog";

const GROUP_TYPES = [
  { id: "creative", icon: "🎸", name: "Band / Creative", desc: "Music, art, makers", color: "#7c3aed" },
  { id: "sports", icon: "⚽", name: "Sports Club", desc: "Teams, leagues, rec", color: "#059669" },
  { id: "oss", icon: "💻", name: "Open Source", desc: "Code, docs, community", color: "#2563eb" },
  { id: "nonprofit", icon: "🏡", name: "Nonprofit", desc: "Charity, faith, civic", color: "#d97706" },
  { id: "other", icon: "✨", name: "Something else", desc: "Book club, co-op, neighborhood, whatever", color: "#dc2626", wide: true as const },
] as const;

type GroupTypeEntry = (typeof GROUP_TYPES)[number];

type GroupType = (typeof GROUP_TYPES)[number]["id"];

type Track = "governance_only" | "credit_economy";

const TRACKS = [
  {
    id: "governance_only" as Track,
    name: "Transparent governance",
    desc: "Track participation, manage budgets, and make decisions together. No tokens or credits.",
    hint: "Best for nonprofits, clubs, and community orgs",
  },
  {
    id: "credit_economy" as Track,
    name: "Credit economy",
    desc: "Everything above, plus members earn credits for participation that carry weight in governance.",
    hint: "Best for collectives, bands, OSS projects",
  },
] as const;

export default function NewGroupOnboarding() {
  const { status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1
  const [groupType, setGroupType] = useState<GroupType>("creative");

  // Step 2 (track)
  const [selectedTrack, setSelectedTrack] = useState<Track>("governance_only");

  // Step 3
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  // Step 4
  const [membershipMode, setMembershipMode] = useState<"invite_only" | "open">("invite_only");
  const [inviteEmails, setInviteEmails] = useState<{ email: string; status: "checking" | "found" | "not_found"; name?: string | null }[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [inviteErrors, setInviteErrors] = useState<string[]>([]);

  // Result
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdGroup, setCreatedGroup] = useState<{ id: string; joinCode: string } | null>(null);
  const [copied, setCopied] = useState(false);

  if (status !== "authenticated") return null;

  const selectedType = GROUP_TYPES.find((t) => t.id === groupType)!;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  async function addEmail() {
    const email = emailInput.trim().toLowerCase();
    setEmailError(null);
    if (!email) return;
    if (!emailRegex.test(email)) {
      setEmailError("Enter a valid email address");
      return;
    }
    if (inviteEmails.some((e) => e.email === email)) {
      setEmailError("Already added");
      return;
    }
    setInviteEmails((prev) => [...prev, { email, status: "checking" }]);
    setEmailInput("");

    try {
      const res = await fetch(`/api/users/lookup?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      setInviteEmails((prev) =>
        prev.map((e) =>
          e.email === email
            ? { ...e, status: data.exists ? "found" : "not_found", name: data.name ?? null }
            : e
        )
      );
    } catch {
      setInviteEmails((prev) =>
        prev.map((e) => (e.email === email ? { ...e, status: "not_found" } : e))
      );
    }
  }

  async function handleCreate() {
    setCreating(true);
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || null,
        type: groupType,
        color: selectedType.color,
        membershipMode,
        track: selectedTrack,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setCreateError(data?.error || "Failed to create group");
      setCreating(false);
      return;
    }

    const group = await res.json();
    setCreatedGroup(group);
    track("group_created", { name_length: name.length });

    // Send invites to all emails (best-effort, don't block)
    const errors: string[] = [];
    for (const { email } of inviteEmails) {
      const invRes = await fetch(`/api/groups/${group.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!invRes.ok) {
        const data = await invRes.json();
        errors.push(`${email}: ${data.error}`);
      }
    }
    setInviteErrors(errors);
    setCreating(false);
  }

  return (
    <div className="min-h-screen bg-[#FAF7F2]">
      <div className="max-w-[480px] mx-auto px-4 py-4 pb-20">
        {/* Progress bar */}
        <div className="flex gap-1.5 mb-6">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`flex-1 h-1 rounded-full ${
                s < step ? "bg-[#8B6548]" : s === step ? "bg-violet-600" : "bg-[#e8e0d4]"
              }`}
            />
          ))}
        </div>

        {/* Step 1: Type */}
        {step === 1 && (
          <div className="bg-white border border-[#e8e0d4] rounded-2xl p-7 relative">
            <span className="absolute -top-2.5 left-6 bg-[#1a1a1a] text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full tracking-wide">
              Step 1 of 4
            </span>
            <h2 className="text-[22px] font-bold tracking-tight mb-5 leading-tight">
              What kind of group is this?
            </h2>

            <div className="grid grid-cols-2 gap-3">
              {GROUP_TYPES.filter((t) => !("wide" in t)).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setGroupType(t.id)}
                  className={`p-5 border-2 rounded-xl text-center transition-all ${
                    groupType === t.id
                      ? "border-violet-600 bg-violet-50"
                      : "border-[#e8e0d4] hover:border-[#E8D5BC] hover:bg-[#FDF8F0]"
                  }`}
                >
                  <div className="text-[28px] mb-2">{t.icon}</div>
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-[#999] mt-0.5">{t.desc}</div>
                </button>
              ))}
              {GROUP_TYPES.filter((t) => "wide" in t).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setGroupType(t.id)}
                  className={`col-span-2 flex items-center gap-3 p-3.5 border-2 rounded-xl text-left transition-all ${
                    groupType === t.id
                      ? "border-violet-600 bg-violet-50"
                      : "border-[#e8e0d4] hover:border-[#E8D5BC] hover:bg-[#FDF8F0]"
                  }`}
                >
                  <span className="text-2xl">{t.icon}</span>
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs text-[#999]">{t.desc}</div>
                  </div>
                </button>
              ))}
            </div>

            <p className="text-[13px] text-[#999] mt-4">
              This helps us set sensible defaults. You can change everything later.
            </p>

            <button
              onClick={() => {
                setSelectedTrack(groupType === "nonprofit" ? "governance_only" : "credit_economy");
                setStep(2);
              }}
              className="w-full mt-5 py-3.5 bg-violet-600 text-white rounded-xl text-base font-semibold hover:bg-violet-700 transition-colors"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 2: Track */}
        {step === 2 && (
          <div className="bg-white border border-[#e8e0d4] rounded-2xl p-7 relative">
            <span className="absolute -top-2.5 left-6 bg-[#1a1a1a] text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full tracking-wide">
              Step 2 of 4
            </span>
            <h2 className="text-[22px] font-bold tracking-tight mb-5 leading-tight">
              How should governance work?
            </h2>

            <div className="flex flex-col gap-3">
              {TRACKS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTrack(t.id)}
                  className={`p-5 border-2 rounded-xl text-left transition-all ${
                    selectedTrack === t.id
                      ? "border-violet-600 bg-violet-50"
                      : "border-[#e8e0d4] hover:border-[#E8D5BC] hover:bg-[#FDF8F0]"
                  }`}
                >
                  <div className="text-sm font-semibold mb-1">{t.name}</div>
                  <div className="text-[13px] text-[#666] leading-snug">{t.desc}</div>
                  <div className="text-xs text-[#999] mt-2">{t.hint}</div>
                </button>
              ))}
            </div>

            <p className="text-[13px] text-[#999] mt-4">
              You can change this later in group settings.
            </p>

            <button
              onClick={() => setStep(3)}
              className="w-full mt-5 py-3.5 bg-violet-600 text-white rounded-xl text-base font-semibold hover:bg-violet-700 transition-colors"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 3: Name */}
        {step === 3 && (
          <div className="bg-white border border-[#e8e0d4] rounded-2xl p-7 relative">
            <span className="absolute -top-2.5 left-6 bg-[#1a1a1a] text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full tracking-wide">
              Step 3 of 4
            </span>
            <h2 className="text-[22px] font-bold tracking-tight mb-5 leading-tight">
              Name your group
            </h2>

            <div className="mb-5">
              <label className="block text-[13px] font-semibold text-[#666] mb-1.5">Group name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Riverside Trail Crew"
                className="w-full px-3.5 py-3 border border-[#e8e0d4] rounded-xl text-[15px] bg-[#FDF8F0] focus:outline-none focus:border-violet-600 focus:ring-1 focus:ring-violet-600"
              />
            </div>

            <div className="mb-5">
              <label className="block text-[13px] font-semibold text-[#666] mb-1.5">
                Description <span className="font-normal text-[#999]">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does your group do?"
                rows={2}
                className="w-full px-3.5 py-3 border border-[#e8e0d4] rounded-xl text-sm bg-[#FDF8F0] resize-none focus:outline-none focus:border-violet-600 focus:ring-1 focus:ring-violet-600 font-[inherit]"
              />
            </div>

            <p className="text-[13px] text-[#999]">
              This is what members see when they join. Keep it simple.
            </p>

            <button
              onClick={() => setStep(4)}
              disabled={!name.trim()}
              className="w-full mt-5 py-3.5 bg-violet-600 text-white rounded-xl text-base font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 4: Invite */}
        {step === 4 && !createdGroup && (
          <div className="bg-white border border-[#e8e0d4] rounded-2xl p-7 relative">
            <span className="absolute -top-2.5 left-6 bg-[#1a1a1a] text-white text-[11px] font-bold px-2.5 py-0.5 rounded-full tracking-wide">
              Step 4 of 4
            </span>
            <h2 className="text-[22px] font-bold tracking-tight mb-5 leading-tight">
              How do people join?
            </h2>

            <div className="flex gap-2 mb-5">
              {(["invite_only", "open"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setMembershipMode(mode)}
                  className={`flex-1 py-3 border-2 rounded-xl text-center transition-all ${
                    membershipMode === mode
                      ? "border-violet-600 bg-violet-50"
                      : "border-[#e8e0d4]"
                  }`}
                >
                  <div className="text-sm font-semibold">
                    {mode === "invite_only" ? "Invite only" : "Open"}
                  </div>
                  <div className="text-xs text-[#999] mt-0.5">
                    {mode === "invite_only" ? "You add members" : "Anyone with the link"}
                  </div>
                </button>
              ))}
            </div>

            <div className="mb-5">
              <label className="block text-[13px] font-semibold text-[#666] mb-1.5">
                Add your founding members
              </label>
              <div className={`px-3.5 py-3 border rounded-xl bg-[#FDF8F0] min-h-[48px] ${emailError ? "border-red-400" : "border-[#e8e0d4]"}`}>
                {inviteEmails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {inviteEmails.map(({ email, status, name }) => (
                      <span
                        key={email}
                        className={`flex items-center gap-1.5 px-2.5 py-1 bg-white border rounded-full text-[13px] ${
                          status === "found" ? "border-green-300" : status === "not_found" ? "border-amber-300" : "border-[#e8e0d4]"
                        }`}
                      >
                        <span
                          className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-semibold text-white ${
                            status === "checking" ? "animate-pulse" : ""
                          }`}
                          style={{ backgroundColor: status === "not_found" ? "#d97706" : selectedType.color }}
                        >
                          {email.charAt(0).toUpperCase()}
                        </span>
                        <span>{name || email.split("@")[0]}</span>
                        {status === "not_found" && (
                          <span className="text-[10px] text-amber-600">not on brij</span>
                        )}
                        <button
                          onClick={() => setInviteEmails((prev) => prev.filter((e) => e.email !== email))}
                          className="text-[11px] text-[#999] ml-0.5"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => { setEmailInput(e.target.value); setEmailError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addEmail();
                    }
                  }}
                  placeholder="Enter email and press Enter..."
                  className="w-full text-sm bg-transparent outline-none placeholder-[#999]"
                />
              </div>
              {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
              {inviteEmails.some((e) => e.status === "not_found") && (
                <p className="text-xs text-amber-600 mt-1">
                  People not on brij yet will need to sign up before they can join. Share the invite link instead.
                </p>
              )}
            </div>

            <p className="text-[13px] text-[#999]">
              You can always add more people later. Share the link or add them by email.
            </p>

            {createError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">{createError}</p>
            )}

            <button
              onClick={() => { setCreateError(null); handleCreate(); }}
              disabled={creating}
              className="w-full mt-5 py-3.5 bg-violet-600 text-white rounded-xl text-base font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create group"}
            </button>
            <button
              onClick={() => {
                setInviteEmails([] as typeof inviteEmails);
                handleCreate();
              }}
              disabled={creating}
              className="w-full mt-2 py-3 text-sm text-[#999] hover:text-[#666]"
            >
              Invite later — just create the group
            </button>
          </div>
        )}

        {/* Success state */}
        {createdGroup && (
          <div className="bg-white border border-[#e8e0d4] rounded-2xl p-7 text-center">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white mx-auto mb-4"
              style={{ backgroundColor: selectedType.color }}
            >
              {name.charAt(0).toUpperCase()}
            </div>
            <h2 className="text-xl font-bold text-bark-900 mb-1">{name}</h2>
            <p className="text-sm text-[#999] mb-6">Your group is ready</p>

            {inviteEmails.length > 0 && inviteErrors.length === 0 && (
              <p className="text-sm text-green-600 mb-4">
                {inviteEmails.length}{" "}
                {inviteEmails.length === 1 ? "invite" : "invites"} sent — they&apos;ll need to accept
              </p>
            )}
            {inviteErrors.length > 0 && (
              <div className="text-left mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs font-semibold text-amber-700 mb-1">Some invites couldn&apos;t be sent:</p>
                {inviteErrors.map((err, i) => (
                  <p key={i} className="text-xs text-amber-600">{err}</p>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 px-3.5 py-3 bg-[#FDF8F0] border border-[#E8D5BC] rounded-xl mb-6">
              <span className="flex-1 text-[13px] text-[#666] truncate text-left font-mono">
                {typeof window !== "undefined" ? window.location.origin : ""}/groups/join/{createdGroup.joinCode}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/groups/join/${createdGroup.joinCode}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="px-3 py-1.5 bg-violet-600 text-white rounded-md text-xs font-semibold shrink-0"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <button
              onClick={() => router.push("/")}
              className="w-full py-3.5 bg-violet-600 text-white rounded-xl text-base font-semibold hover:bg-violet-700 transition-colors"
            >
              Go to dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
