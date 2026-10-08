"use client";

// The player's side of lock-in: confirm the role staff gave you, or, for a
// player staff added by hand, find your spot by Riot ID and lock it in. The
// database checks the role again and links the account (offseason_lock_in).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { ROLE_LABELS, type LolRole } from "@/lib/draft/types";
import { lockInAction } from "@/lib/offseason/actions";
import { findSpot, lockInState, type ClaimableSpot } from "@/lib/offseason/lockIn";
import type { OffseasonEntrant } from "@/lib/offseason/types";
import { Panel } from "./ui";

type Message = { kind: "error" | "done"; text: string } | null;

function useLockIn(eventId: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message>(null);
  const lockIn = (role: LolRole, riotId?: string) =>
    startTransition(async () => {
      const result = await lockInAction({ eventId, role, riotId });
      if (result.ok) {
        setMessage({ kind: "done", text: `You're locked in as ${ROLE_LABELS[role]}.` });
      } else {
        setMessage({ kind: "error", text: result.error });
        // The role may have changed since the page loaded; show the current one.
        router.refresh();
      }
    });
  return { pending, message, lockIn };
}

function Feedback({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-danger" : "text-sm text-success"}>
      {message.text}
    </p>
  );
}

function LockInButton({ role, pending, onClick }: { role: LolRole; pending: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={pending} className="btn-primary self-start px-5 py-2.5 text-sm uppercase tracking-wide disabled:opacity-50">
      {pending ? "Locking in…" : `Lock in as ${ROLE_LABELS[role]}`}
    </button>
  );
}

const NOT_HAPPY = "Not happy with it, or can't play? Message staff in Discord instead of locking in.";

function OwnLockIn({ eventId, entry }: { eventId: string; entry: OffseasonEntrant }) {
  const { pending, message, lockIn } = useLockIn(eventId);
  const state = lockInState(entry);

  if (entry.status === "benched") {
    return (
      <Panel title="Sitting out">
        <p className="text-sm text-muted">You&apos;re sitting out for now. Staff will message you in Discord if that changes.</p>
      </Panel>
    );
  }
  if (state === "locked") {
    return (
      <Panel title="Locked in">
        <p className="text-sm text-muted">
          You&apos;re locked in as <span className="font-semibold text-white">{ROLE_LABELS[entry.assigned_role!]}</span>. If anything changes,
          tell staff in Discord.
        </p>
      </Panel>
    );
  }
  if (state !== "pending" && state !== "role_changed") return null;

  const role = entry.assigned_role!;
  return (
    <Panel title="Lock in your role">
      {state === "role_changed" ? (
        <p className="text-sm font-semibold text-white">
          Staff moved you from {ROLE_LABELS[entry.locked_in_role!]} to {ROLE_LABELS[role]}, so you need to lock in again.
        </p>
      ) : null}
      <p className="text-sm text-muted">
        You&apos;re playing <span className="font-semibold text-white">{ROLE_LABELS[role]}</span>. Lock in to confirm you&apos;re playing
        and happy with that role. {NOT_HAPPY}
      </p>
      <LockInButton role={role} pending={pending} onClick={() => lockIn(role)} />
      <Feedback message={message} />
    </Panel>
  );
}

function ClaimLockIn({ eventId, spots }: { eventId: string; spots: ClaimableSpot[] }) {
  const { pending, message, lockIn } = useLockIn(eventId);
  const [typed, setTyped] = useState("");
  const [searched, setSearched] = useState<string | null>(null);
  const spot = searched === null ? null : findSpot(spots, searched);

  const find = (event: FormEvent) => {
    event.preventDefault();
    setSearched(typed);
  };

  return (
    <Panel title="Lock in your role">
      <p className="text-sm text-muted">
        Staff added you from the interest form? Enter the Riot ID you gave to find your spot. Locking in links it to your account.
      </p>
      <form onSubmit={find} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-white">
          Riot ID
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Name#NA1"
            className="input-brand w-56 px-3 py-2 text-sm"
          />
        </label>
        <button type="submit" disabled={!typed.trim()} className="btn-pill text-sm disabled:opacity-50">
          Find my spot
        </button>
      </form>
      {searched !== null && !spot ? (
        <p className="text-sm text-muted">No open spot has that Riot ID. Check it matches the one you gave, or ask staff in Discord.</p>
      ) : null}
      {spot ? (
        <>
          <p className="text-sm text-muted">
            Found you: <span className="font-semibold text-white">{spot.displayName}</span> ({spot.riotId}), playing{" "}
            <span className="font-semibold text-white">{ROLE_LABELS[spot.role]}</span>. {NOT_HAPPY}
          </p>
          <LockInButton role={spot.role} pending={pending} onClick={() => lockIn(spot.role, spot.riotId)} />
        </>
      ) : null}
      <Feedback message={message} />
    </Panel>
  );
}

/**
 * Shown once roles are assigned. `entry` is the viewer's own sign-up; `spots`
 * are the staff-added players with a role and no account yet.
 */
export default function LockIn({
  eventId,
  signedIn,
  entry,
  spots,
}: {
  eventId: string;
  signedIn: boolean;
  entry: OffseasonEntrant | null;
  spots: ClaimableSpot[];
}) {
  if (entry) return <OwnLockIn eventId={eventId} entry={entry} />;
  if (!signedIn) {
    return (
      <Panel title="Lock in your role">
        <p className="text-sm text-muted">Playing in the offseason? Sign in with Discord to confirm your role.</p>
        <Link href="/login?redirect=/offseason" className="btn-pill self-start text-sm">
          Sign in
        </Link>
      </Panel>
    );
  }
  if (spots.length === 0) return null;
  return <ClaimLockIn eventId={eventId} spots={spots} />;
}
