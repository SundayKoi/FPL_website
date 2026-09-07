import DailyGameWall from "@/components/daily/DailyGameWall";

/** Kept for the existing imports; the wall itself is the shared one. */
export default function HigherLowerAccessNotice({ league, message }: { league: string; message?: string | null }) {
  return (
    <DailyGameWall
      league={league}
      game="Higher or Lower"
      redirect={league === "Academy" ? "/academy/higher-lower" : "/higher-lower"}
      message={message}
    />
  );
}
