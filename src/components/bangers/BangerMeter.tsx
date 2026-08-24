import { getBangerClassification } from "@/lib/bangers/feed";

type BangerMeterProps = {
  score: number;
  voteCount: number;
  detail?: string;
  compact?: boolean;
  className?: string;
};

const fillClasses = {
  banger: "bg-banana",
  mid: "bg-blue-400",
  stinker: "bg-purple-300",
} as const;

const labelClasses = {
  banger: "text-banana",
  mid: "text-blue-300",
  stinker: "text-purple-200",
} as const;

export default function BangerMeter({ score, voteCount, detail, compact = false, className = "" }: BangerMeterProps) {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  const hasVotes = voteCount > 0;
  const classification = getBangerClassification(normalizedScore);
  const accessibleName = hasVotes ? `${normalizedScore}% ${classification.label}` : "No votes yet";

  return (
    <div
      className={`flex items-center gap-3 ${className}`}
      role="meter"
      aria-label={accessibleName}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalizedScore}
    >
      <div className={`h-2 flex-1 overflow-hidden rounded-full bg-white/10 ${compact ? "min-w-20" : "min-w-28"}`}>
        <div className={`h-full rounded-full transition-all ${fillClasses[classification.key]}`} style={{ width: `${hasVotes ? normalizedScore : 0}%` }} />
      </div>
      <span className={`${compact ? "text-xs" : "font-mono text-sm"} font-bold ${labelClasses[classification.key]}`}>
        {hasVotes ? `${normalizedScore}%` : "—"}
      </span>
      <span className={`${compact ? "text-[0.62rem]" : "text-xs"} font-bold uppercase tracking-[0.12em] ${labelClasses[classification.key]}`}>
        {hasVotes ? classification.label : "No votes yet"}
      </span>
      {detail ? <span className="text-xs text-white/45">{detail}</span> : null}
    </div>
  );
}
