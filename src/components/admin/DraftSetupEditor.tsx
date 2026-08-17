"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { errCode, errMessage, type Draft, type Player, type Profile, type Team } from "@/lib/draft/types";
import TeamEditor from "./TeamEditor";
import PlayerPoolEditor from "./PlayerPoolEditor";
import DraftScheduleEditor from "./DraftScheduleEditor";

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
      const msg = errMessage(error);
      setStartErr(code === "SETUP_INVALID" ? msg.replace(/^SETUP_INVALID:\s*/, "") : msg);
      return;
    }
    router.push(`/draft/${draft.id}`);
  };

  if (draft.status !== "setup") {
    return (
      <div className="card-brand p-6 text-sm text-steel">
        This draft is already <span className="font-semibold text-white">{draft.status}</span>.{" "}
        <a href={`/draft/${draft.id}`} className="text-coral underline">
          Go to the board
        </a>
        .
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <DraftScheduleEditor draft={draft} onSaved={(startsAt) => setDraft((current) => ({ ...current, starts_at: startsAt }))} />
      <TeamEditor draftId={draft.id} teams={teams} players={players} profiles={profiles} onChanged={refetch} />
      <PlayerPoolEditor draftId={draft.id} players={players} onChanged={refetch} />

      <div className="card-brand flex flex-col gap-2 p-4">
        <button
          onClick={startDraft}
          disabled={starting}
          className="w-fit rounded bg-coral px-4 py-2 text-sm font-display font-bold not-italic text-navy hover:brightness-110 disabled:opacity-40"
        >
          Start draft
        </button>
        {startErr && <p className="text-sm text-red-400">{startErr}</p>}
      </div>
    </div>
  );
}
