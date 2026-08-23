import { championIconUrl } from "@/lib/match-draft/champions";

export type ChampionDatumTone = "neutral" | "pick-blue" | "pick-red" | "ban";

export default function ChampionDatum({ champion, tone = "neutral", label, testId }: { champion: string | null; tone?: ChampionDatumTone; label?: string; testId?: string }) {
  if (!champion) return <span data-testid={testId} className="inline-flex h-9 min-w-20 items-center justify-center rounded border border-dashed border-line px-2 text-xs text-steel">{label ?? "Skipped"}</span>;
  const icon = championIconUrl(champion);
  const toneClass = tone === "ban" ? "border-red-400/60 bg-red-950/30" : tone === "pick-blue" ? "border-cyan/50 bg-cyan/10" : tone === "pick-red" ? "border-purple/60 bg-purple/10" : "border-line bg-navy/60";
  return <span data-testid={testId} className={`inline-flex min-w-20 items-center gap-1.5 rounded border px-1.5 py-1 text-xs text-white ${toneClass}`}>
    {icon ? <img src={icon} alt="" className="h-6 w-6 rounded-sm object-cover" /> : <span className="h-6 w-6 rounded-sm bg-line" aria-hidden="true" />}
    <span>{champion}</span>
  </span>;
}
