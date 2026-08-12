"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { ROLE_ORDER, type LolRole } from "@/lib/draft/types";
import { RANK_OPTIONS } from "@/lib/signup/ranks";
import type { PlayerStatus } from "@/lib/signup/types";

const ROLE_LABELS: Record<LolRole, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  adc: "ADC",
  support: "Support",
};

interface FormState {
  discord: string;
  riotId: string;
  opgg: string;
  playerStatus: "" | PlayerStatus;
  currentRank: string;
  peakRank: string;
  primaryRole: "" | LolRole;
  secondaryRole: "" | LolRole;
  captainInterest: "" | "yes" | "no";
}

const EMPTY: FormState = {
  discord: "",
  riotId: "",
  opgg: "",
  playerStatus: "",
  currentRank: "",
  peakRank: "",
  primaryRole: "",
  secondaryRole: "",
  captainInterest: "",
};

/** First validation problem in form order, or null when submittable. */
export function validateSignup(form: FormState): string | null {
  if (form.discord.trim().length < 2) return "Enter your Discord username.";
  const riotId = form.riotId.trim();
  if (!riotId) return "Enter your Riot ID.";
  if (!/.+#.+/.test(riotId)) return "Riot ID needs the tag — like Name#NA1.";
  if (form.opgg.trim().length < 10) return "Paste your op.gg link (include ALL level 30+ accounts).";
  if (!form.playerStatus) return "Tell us if you're new or returning.";
  if (!form.currentRank) return "Pick your current rank.";
  if (!form.peakRank) return "Pick your peak rank from the last two seasons.";
  if (!form.primaryRole) return "Pick your primary role.";
  if (!form.captainInterest) return "Answer the captain question.";
  return null;
}

/** DB row payload for a validated form. */
export function signupPayload(form: FormState, season: string) {
  return {
    season,
    discord: form.discord.trim(),
    riot_id: form.riotId.trim(),
    opgg: form.opgg.trim(),
    player_status: form.playerStatus as PlayerStatus,
    current_rank: form.currentRank,
    peak_rank: form.peakRank,
    primary_role: form.primaryRole as LolRole,
    // Same-as-primary degrades to "no secondary" rather than a DB error.
    secondary_role:
      form.secondaryRole && form.secondaryRole !== form.primaryRole ? form.secondaryRole : null,
    captain_interest: form.captainInterest === "yes",
  };
}

const inputClass =
  "rounded border border-line bg-navy px-3 py-2 text-sm text-white placeholder:text-steel/60 focus:border-gold focus:outline-none";
const labelClass = "flex flex-col gap-1.5 text-sm font-semibold text-white";
const hintClass = "text-xs font-normal text-steel";

export default function SignupForm({ season }: { season: string }) {
  const supabase = createClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "done" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validateSignup(form);
    if (problem) {
      setStatus({ kind: "error", message: problem });
      return;
    }
    setStatus({ kind: "saving" });
    const { error } = await supabase.from("signups").insert(signupPayload(form, season));
    if (error) {
      setStatus({ kind: "error", message: error.message });
      return;
    }
    setStatus({ kind: "done" });
  };

  if (status.kind === "done") {
    return (
      <div className="card-brand p-8 text-center">
        <p className="type-display text-3xl">You&apos;re signed up!</p>
        <p className="mt-3 text-steel">
          Your {season} signup is in. Staff will review the player pool — watch Discord for
          next steps.
        </p>
        <button
          type="button"
          onClick={() => {
            setForm(EMPTY);
            setStatus({ kind: "idle" });
          }}
          className="mt-6 rounded-full border border-line bg-panel px-4 py-2 text-xs font-semibold uppercase tracking-wide text-steel hover:text-white"
        >
          Submit another signup
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card-brand flex flex-col gap-5 p-6 sm:p-8" noValidate>
      <label className={labelClass}>
        Discord username
        <input
          type="text"
          value={form.discord}
          onChange={(e) => set("discord", e.target.value)}
          placeholder="yourname"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Riot ID
        <input
          type="text"
          value={form.riotId}
          onChange={(e) => set("riotId", e.target.value)}
          placeholder="Name#NA1"
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        op.gg link
        <span className={hintClass}>
          Include ALL accounts level 30 or above — use a multi-search link, or one link per line.
        </span>
        <textarea
          value={form.opgg}
          onChange={(e) => set("opgg", e.target.value)}
          placeholder="https://op.gg/lol/summoners/na/Name-NA1"
          rows={3}
          className={inputClass}
        />
      </label>

      <label className={labelClass}>
        Are you a new or returning player?
        <select
          value={form.playerStatus}
          onChange={(e) => set("playerStatus", e.target.value as FormState["playerStatus"])}
          className={inputClass}
        >
          <option value="">Select…</option>
          <option value="new">New to FPL</option>
          <option value="returning">Returning player</option>
        </select>
      </label>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className={labelClass}>
          Current rank
          <select
            value={form.currentRank}
            onChange={(e) => set("currentRank", e.target.value)}
            className={inputClass}
          >
            <option value="">Select…</option>
            {RANK_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Peak rank in the last two seasons
          <select
            value={form.peakRank}
            onChange={(e) => set("peakRank", e.target.value)}
            className={inputClass}
          >
            <option value="">Select…</option>
            {RANK_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className={labelClass}>
          Primary role
          <select
            value={form.primaryRole}
            onChange={(e) => set("primaryRole", e.target.value as FormState["primaryRole"])}
            className={inputClass}
          >
            <option value="">Select…</option>
            {ROLE_ORDER.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Secondary role <span className={hintClass}>(optional)</span>
          <select
            value={form.secondaryRole}
            onChange={(e) => set("secondaryRole", e.target.value as FormState["secondaryRole"])}
            className={inputClass}
          >
            <option value="">None</option>
            {ROLE_ORDER.filter((role) => role !== form.primaryRole).map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={labelClass}>
        Would you like to be a captain this season?
        <span className={hintClass}>
          Captains draft and run a team for the whole split (see the Info page for what that
          involves).
        </span>
        <select
          value={form.captainInterest}
          onChange={(e) => set("captainInterest", e.target.value as FormState["captainInterest"])}
          className={inputClass}
        >
          <option value="">Select…</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>

      {status.kind === "error" && (
        <p role="alert" className="text-sm text-red-400">
          {status.message}
        </p>
      )}

      <button
        type="submit"
        disabled={status.kind === "saving"}
        className="btn-pill w-fit disabled:opacity-50"
      >
        {status.kind === "saving" ? "Submitting…" : `Sign up for ${season}`}
      </button>
    </form>
  );
}
