"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Admin switch for the signup window (league_settings.signups_open). The
 * flag also gates the signups INSERT policy, so closing here really closes
 * the door — direct POSTs are rejected too, not just the hidden form.
 */
export default function AdminSignupsToggle({ signupsOpen }: { signupsOpen: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.rpc("set_signups_open", { p_open: !signupsOpen });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  };

  return (
    <div className="card-brand flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <span className="label-dash">Signup window</span>
        <p className="mt-1 text-sm text-muted">
          {signupsOpen
            ? "Signups are open — the form is live for everyone."
            : "Signups are closed — visitors see a closed notice, and submissions are blocked at the database."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void handleToggle()}
        disabled={busy}
        aria-pressed={signupsOpen}
        className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition disabled:opacity-50 ${
          signupsOpen
            ? "border border-red-400/40 bg-red-500/10 text-red-400"
            : "bg-action-fill text-white"
        }`}
      >
        {busy ? "Saving…" : signupsOpen ? "Close signups" : "Open signups"}
      </button>
      {error && (
        <p role="alert" className="w-full text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
