import TeamStatsRadar from "@/components/stats/TeamStatsRadar";
import type { TeamAggRow } from "@/lib/stats/types";
import styles from "./ScoutPlayerPools.module.css";

export default function ScoutTeamProfile({
  teamName,
  label,
  stats,
  status = "available",
}: {
  teamName: string;
  label: "Opponent profile" | "Team profile";
  stats: TeamAggRow | null;
  status?: "available" | "unavailable";
}) {
  return <aside className={styles.profileCard} aria-label={`${label}: ${teamName}`}>
    <p className={styles.profileEyebrow}>— {label}</p>
    {status === "unavailable" ? <p className={styles.profileEmpty}>Team stats temporarily unavailable.</p> : stats ? <>
      <TeamStatsRadar row={stats} />
    </> : <p className={styles.profileEmpty}>No team stats for this season yet.</p>}
  </aside>;
}
