"use client";
import { useState, useTransition } from "react";
import { registerDiscordCommands } from "@/lib/betting/admin-actions";

/** One button: re-publish the bot's slash-command list to Discord using this
 * deployment's own bot credentials. Exists because the bot token lives only
 * in the deployment env (sensitive — can't be revealed and re-used
 * elsewhere), so "the command list changed" must be actionable from the
 * admin area itself. Local message state instead of useAdminRun: success
 * carries a payload (the registered names) and nothing on the page needs
 * refreshing. */
export default function BotCommandsAdmin() {
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await registerDiscordCommands();
      if (!result.ok) {
        setFailed(true);
        setMessage(result.error);
        return;
      }
      setFailed(false);
      setMessage(`Registered ${result.registered.length} commands: ${result.registered.join(", ")}.`);
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="label-dash">Discord bot</h2>
      <p className="text-sm text-steel">
        Publish the current slash-command list to the server the bot runs in. Safe to re-run; commands
        removed from the code disappear from Discord too.
      </p>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="rounded-full bg-coral px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-navy disabled:opacity-50"
        >
          {pending ? "Registering…" : "Register commands"}
        </button>
        {message ? (
          <p className={`text-sm ${failed ? "text-red-300" : "text-steel"}`} role="status">
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
