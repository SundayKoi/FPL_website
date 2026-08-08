"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { errCode, type Draft, type Player, type Profile, type Team } from "@/lib/draft/types";
import TeamEditor from "./TeamEditor";
import PlayerPoolEditor from "./PlayerPoolEditor";

export default function DraftSetupEditor({
  draft: initialDraft,
  teams: initialTeams,
  players: initialPlayers,
  profiles,
}: {
  draft: Draft;
  teams: Team[];
  players: Player[];
  profiles: Profile[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [draft, setDraft] = useState(initialDraft);
  const [teams, setTeams] = useState(initialTeams);
  const [players, setPlayers] = useState(initialPlayers);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const refetch = useCallback(async () => {
    const [d, t, p] = await Promise.all([
      supabase.from("drafts").select("*").eq("id", draft.id).single(),
      supabase.from("teams").select("*").eq("draft_id", draft.id).order("nomination_position"),
      supabase.from("players").select("*").eq("draft_id", draft.id).order("display_name"),
    ]);
    if (d.data) setDraft(d.data as Draft);
    setTeams((t.data as Team[]) ?? []);
    setPlayers((p.data as Player[]) ?? []);
  }, [supabase, draft.id]);

  const startDraft = async () => {
    if (!confirm("Start the draft? Setup will be locked in.")) return;
    setStarting(true);
    setStartErr(null);
    const { error } = await supabase.rpc("start_draft", { p_draft_id: draft.id });
    setStarting(false);
    if (error) {
      const code = errCode(error);
      const msg =
        error instanceof Error
          ? error.message
          : ((error as { message?: string })?.message ?? String(error));
      setStartErr(code === "SETUP_INVALID" ? msg.replace(/^SETUP_INVALID:\s*/, "") : msg);
      return;
    }
    router.push(`/draft/${draft.id}`);
  };

  if (draft.status !== "setup") {
    return (
      <div className="rounded-lg border border-zinc-800 p-6 text-sm text-zinc-300">
        This draft is already <span className="font-semibold">{draft.status}</span>.{" "}
        <a href={`/draft/${draft.id}`} className="underline">
          Go to the board
        </a>
        .
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <TeamEditor draftId={draft.id} teams={teams} players={players} profiles={profiles} onChanged={refetch} />
      <PlayerPoolEditor draftId={draft.id} players={players} onChanged={refetch} />

      <div className="flex flex-col gap-2 rounded-lg border border-emerald-800 bg-emerald-950/20 p-4">
        <button
          onClick={startDraft}
          disabled={starting}
          className="w-fit rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Start draft
        </button>
        {startErr && <p className="text-sm text-red-400">{startErr}</p>}
      </div>
    </div>
  );
}
