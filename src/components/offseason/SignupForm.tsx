"use client";

import { useState, useTransition, type FormEvent } from "react";
import { ROLE_LABELS, ROLE_ORDER, type LolRole } from "@/lib/draft/types";
import { signUpAction, withdrawAction } from "@/lib/offseason/actions";
import type { OffseasonEntrant } from "@/lib/offseason/types";
import { RANK_OPTIONS } from "@/lib/signup/ranks";

const inputClass = "input-brand px-3 py-2 text-sm";
const labelClass = "flex flex-col gap-1.5 text-sm font-semibold text-white";
const hintClass = "text-xs font-normal text-muted";

interface FormState {
  displayName: string;
  riotId: string;
  opggUrl: string;
  currentRank: string;
  primaryRole: "" | LolRole;
  secondaryRole: "" | LolRole;
}

/** First problem in form order, or null when the form can be sent. */
export function validateOffseasonSignup(form: FormState): string | null {
  if (!form.displayName.trim()) return "Enter the name you go by.";
  if (!/^[^#]{3,16}#[^#]{2,5}$/.test(form.riotId.trim())) return "Enter your Riot ID as Name#TAG.";
  if (!form.currentRank) return "Pick your current rank.";
  if (!form.primaryRole) return "Pick your primary role.";
  if (form.secondaryRole && form.secondaryRole === form.primaryRole) return "Your secondary role must differ from your primary.";
  return null;
}

export default function OffseasonSignupForm({
  eventId,
  entry,
  defaultName,
}: {
  eventId: string;
  entry: OffseasonEntrant | null;
  defaultName: string;
}) {
  const active = entry !== null && entry.status !== "withdrawn";
  const [form, setForm] = useState<FormState>({
    displayName: entry?.display_name ?? defaultName,
    riotId: entry?.riot_id ?? "",
    opggUrl: entry?.opgg_url ?? "",
    currentRank: entry?.current_rank ?? "",
    primaryRole: entry?.primary_role ?? "",
    secondaryRole: entry?.secondary_role ?? "",
  });
  const [message, setMessage] = useState<{ kind: "error" | "done"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = validateOffseasonSignup(form);
    if (problem) {
      setMessage({ kind: "error", text: problem });
      return;
    }
    startTransition(async () => {
      const result = await signUpAction({
        eventId,
        displayName: form.displayName,
        riotId: form.riotId,
        opggUrl: form.opggUrl,
        currentRank: form.currentRank,
        primaryRole: form.primaryRole as LolRole,
        secondaryRole: form.secondaryRole || null,
      });
      setMessage(
        result.ok
          ? { kind: "done", text: active ? "Your sign-up is updated." : "You're signed up. Watch Discord for week 1." }
          : { kind: "error", text: result.error },
      );
    });
  };

  const withdraw = () => {
    if (!window.confirm("Withdraw from the offseason tournament?")) return;
    startTransition(async () => {
      const result = await withdrawAction(eventId);
      setMessage(result.ok ? { kind: "done", text: "You've withdrawn. Sign up again any time before sign-ups close." } : { kind: "error", text: result.error });
    });
  };

  return (
    <form onSubmit={submit} className="card-brand flex max-w-2xl flex-col gap-5 p-6 sm:p-8" noValidate>
      <label className={labelClass}>
        Name
        <span className={hintClass}>How you appear on teams and leaderboards.</span>
        <input type="text" maxLength={32} value={form.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputClass} />
      </label>

      <label className={labelClass}>
        Riot ID
        <span className={hintClass}>The account you will play on. Stats are matched to it.</span>
        <input type="text" value={form.riotId} onChange={(e) => set("riotId", e.target.value)} placeholder="Name#NA1" className={inputClass} />
      </label>

      <label className={labelClass}>
        op.gg link
        <span className={hintClass}>Optional, but it helps captains.</span>
        <input type="url" value={form.opggUrl} onChange={(e) => set("opggUrl", e.target.value)} placeholder="https://op.gg/lol/summoners/na/Name-NA1" className={inputClass} />
      </label>

      <label className={labelClass}>
        Current rank
        <select value={form.currentRank} onChange={(e) => set("currentRank", e.target.value)} className={inputClass}>
          <option value="">Select…</option>
          {RANK_OPTIONS.map((rank) => (
            <option key={rank} value={rank}>
              {rank}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className={labelClass}>
          Primary role
          <select value={form.primaryRole} onChange={(e) => set("primaryRole", e.target.value as FormState["primaryRole"])} className={inputClass}>
            <option value="">Select…</option>
            {ROLE_ORDER.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Secondary role
          <span className={hintClass}>If your primary is full, you may be moved here.</span>
          <select value={form.secondaryRole} onChange={(e) => set("secondaryRole", e.target.value as FormState["secondaryRole"])} className={inputClass}>
            <option value="">None</option>
            {ROLE_ORDER.filter((role) => role !== form.primaryRole).map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {message ? (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-danger" : "text-sm text-success"}>
          {message.text}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary px-5 py-2.5 text-sm uppercase tracking-wide disabled:opacity-50">
          {pending ? "Saving…" : active ? "Update sign-up" : "Sign up"}
        </button>
        {active ? (
          <button type="button" onClick={withdraw} disabled={pending} className="text-sm font-semibold text-muted underline underline-offset-4 hover:text-danger">
            Withdraw
          </button>
        ) : null}
      </div>
    </form>
  );
}
