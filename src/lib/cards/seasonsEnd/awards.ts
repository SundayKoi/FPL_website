import { gamePoints, type FantasyStatRow } from "@/lib/stats/fantasyPoints";

export type SeasonRow = FantasyStatRow & {
  id: number; season: string; season_phase: string; match_id: string | null;
  team_name: string | null; role: string | null; champion: string | null;
  game_duration_min: number | null; solo_kills: number | null;
  turret_damage: number | null; healing_on_teammates: number | null;
};
export type SeasonFixture = {
  id: string; season: string; stage: string; division: string | null;
  team_a: string | null; team_b: string | null; score_a: number | null; score_b: number | null;
};
export type Winner = { key: string; name: string; champion: string | null; value: number; display: string; evidence: string; roster?: string[] };
export type Award = { id: string; title: string; family: "sovereign" | "record" | "guardian" | "wild" | "story" | "team"; rule: string; winners: Winner[]; unavailable?: string };
const key = (r: SeasonRow) => `${r.summoner_name?.trim().toLowerCase()}#${r.tag?.trim().toLowerCase()}`;
const name = (r: SeasonRow) => `${r.summoner_name}${r.tag ? `#${r.tag}` : ""}`;
const norm = (s: string | null) => s?.trim().toLowerCase() ?? "";
const role = (r: SeasonRow) => ({ TOP: "top", JUNGLE: "jungle", MIDDLE: "mid", MID: "mid", BOTTOM: "adc", ADC: "adc", UTILITY: "support", SUPPORT: "support" }[r.role?.toUpperCase() ?? ""] ?? "unknown");
const sum = (rows: SeasonRow[], field: keyof SeasonRow) => rows.reduce((n, r) => n + Number(r[field] ?? 0), 0);
const complete = (rows: SeasonRow[], fields: (keyof SeasonRow)[]) => rows.every(r => fields.every(f => typeof r[f] === "number" && Number.isFinite(r[f])));
const group = <T,>(rows: T[], by: (r: T) => string): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  for (const r of rows) { const k = by(r); map.set(k, [...(map.get(k) ?? []), r]); }
  return map;
};
const signature = (rows: SeasonRow[]) => [...group(rows.filter(r => r.champion), r => r.champion!).entries()].sort((a,b) => b[1].length-a[1].length || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
const record = (rows: SeasonRow[]) => `${rows.filter(r => r.win).length}–${rows.filter(r => !r.win).length}`;
const player = (rows: SeasonRow[], value: number, display: string, evidence: string): Winner => ({ key: key(rows[0]), name: name(rows[0]), champion: signature(rows), value, display, evidence });
const best = (candidates: Winner[]) => {
  const sorted = candidates.filter(c => Number.isFinite(c.value)).sort((a,b) => b.value-a.value || a.key.localeCompare(b.key));
  return sorted.filter(c => Math.abs(c.value-(sorted[0]?.value ?? 0)) < 1e-8);
};

/** Pure preview calculation. Never consumes playoffs, another season, duplicate
 * player appearances, or incomplete matches as if they were complete games. */
export function buildSeasonAwards(input: SeasonRow[], fixtures: SeasonFixture[], season: string) {
  const scoped = input.filter(r => r.season === season && r.season_phase === "Regular");
  const matches = group(scoped, r => r.match_id ?? "");
  const rows: SeasonRow[] = [];
  let excluded = 0;
  for (const [id, batch] of matches) {
    const teams = [...group(batch, r => norm(r.team_name)).values()];
    const valid = id && batch.length === 10 && new Set(batch.map(key)).size === 10 &&
      batch.every(r => r.summoner_name && r.tag && r.champion && r.team_name && typeof r.win === "boolean") &&
      teams.length === 2 && teams.every(t => t.length === 5 && t.every(r => r.win === t[0].win)) && teams[0][0].win !== teams[1][0].win;
    if (valid) rows.push(...batch); else excluded += batch.length;
  }
  const players = [...group(rows, key).values()];
  const awards: Award[] = [];
  const add = (award: Omit<Award,"winners">, candidates: Winner[], all = false) => awards.push({ ...award, winners: all ? candidates : best(candidates) });
  const numeric = (id: string, title: string, field: keyof SeasonRow, unit: string, family: Award["family"] = "record") => {
    const covered = complete(rows,[field]);
    add({id,title,family,rule:`Highest regular-season total ${unit}. All appearances count; ties share the award.`,unavailable: covered ? undefined : `Missing ${unit} data; award withheld.`}, covered ? players.map(p => player(p,sum(p,field),sum(p,field).toLocaleString("en-US"),`${unit} · ${p.length} games · ${(sum(p,field)/p.length).toFixed(1)} per game`)).filter(p => p.value>0) : []);
  };
  numeric("body-count","Body Count","kills","kills");
  numeric("duelist","Duelist","solo_kills","solo kills");
  numeric("wrecking-ball","Wrecking Ball","turret_damage","turret damage");
  numeric("guardian-angel","Guardian Angel","healing_on_teammates","teammate healing","guardian");
  const visionCovered = complete(rows,["vision_score","game_duration_min"]) && rows.every(r => r.game_duration_min!>0);
  add({id:"all-seeing",title:"All-Seeing",family:"guardian",rule:"Highest total vision score / total minutes. Minimum 8 games; ties share the award.", unavailable: visionCovered ? undefined : "Missing vision or duration data; award withheld."}, visionCovered ? players.filter(p=>p.length>=8).map(p=> { const rate=sum(p,"vision_score")/sum(p,"game_duration_min"); return player(p,rate,rate.toFixed(2),`vision / min · ${p.length} games · ${sum(p,"vision_score")} total vision`); }) : []);
  add({id:"chameleon",title:"The Chameleon",family:"wild",rule:"Most distinct champions played across the regular season; ties share the award."},players.map(p=>player(p,new Set(p.map(r=>r.champion)).size,String(new Set(p.map(r=>r.champion)).size),`unique champions · ${p.length} games · ${record(p)} record`)));

  const scoreFields: (keyof SeasonRow)[] = ["kills","deaths","assists","cs_per_min","vision_score","damage_share_pct","kill_participation_pct"];
  const scoreCovered = complete(rows,scoreFields) && rows.every(r=>role(r)!=="unknown");
  const roleScores = group(rows,role);
  // A game's percentile among all same-role games in this season. Midranks
  // preserve ties. This is a preview award score, not a new card overall.
  const percentiles = new Map<number,number>();
  for (const peers of roleScores.values()) {
    const sorted=peers.map(r=>({id:r.id,score:gamePoints(r)})).sort((a,b)=>a.score-b.score);
    for(let from=0;from<sorted.length;) {
      let to=from+1;
      while(to<sorted.length && sorted[to].score===sorted[from].score) to++;
      const percentile=100*(from+(to-from)/2)/sorted.length;
      for(let i=from;i<to;i++) percentiles.set(sorted[i].id,percentile);
      from=to;
    }
  }
  const performance = (r: SeasonRow) => percentiles.get(r.id)!;
  const avg = (p: SeasonRow[]) => p.reduce((n,r)=>n+performance(r),0)/p.length;
  const champGroups = group(rows,r=>r.champion!);
  const sovereigns: Winner[] = [];
  const pockets: Winner[] = [];
  for (const [champ, games] of [...champGroups].sort(([a],[b])=>a.localeCompare(b))) {
    const candidates = scoreCovered ? [...group(games,key).values()].filter(p=>p.length>=4).map(p=>{
      const wins=p.filter(r=>r.win).length; const score=60*wins/p.length+0.4*avg(p);
      return {...player(p,score,score.toFixed(1),`${champ} · ${record(p)} · ${p.length} games · ${((sum(p,"kills")+sum(p,"assists"))/Math.max(1,sum(p,"deaths"))).toFixed(2)} KDA`),key:`${key(p[0])}:${champ}`,champion:champ};
    }) : [];
    sovereigns.push(...best(candidates));
    if (games.length / Math.max(1,rows.length/10) <= 0.1) pockets.push(...candidates.filter(c=>c.value>=0 && games.filter(r=>`${key(r)}:${champ}`===c.key && r.win).length / games.filter(r=>`${key(r)}:${champ}`===c.key).length>=0.6));
  }
  const scoreUnavailable = scoreCovered ? undefined : "Missing role or performance fields; award withheld.";
  add({id:"sovereigns",title:"Champion Sovereigns",family:"sovereign",rule:"One winner per champion, minimum 4 games. Score = 60% win rate + 40% mean role-adjusted fantasy percentile (0–100). Equal scores share a crown.",unavailable:scoreUnavailable},sovereigns,true);
  add({id:"pocket-pick",title:"Pocket Pick",family:"wild",rule:"Highest Sovereign score on a champion picked in ≤10% of league games. Minimum 4 appearances and 60% win rate.",unavailable:scoreUnavailable},pockets);

  const datesValid=rows.every(r=>r.game_date && Number.isFinite(Date.parse(r.game_date)));
  const dates=[...group(rows,r=>r.match_id!).values()].map(batch=>batch[0].game_date).filter((d): d is string=>Boolean(d)).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const midpoint=dates[Math.floor(dates.length/2)];
  const improvements=scoreCovered && datesValid && midpoint ? players.flatMap(p=>{
    const first=p.filter(r=>Date.parse(r.game_date!)<Date.parse(midpoint)); const last=p.filter(r=>Date.parse(r.game_date!)>=Date.parse(midpoint));
    if(first.length<4 || last.length<4) return [];
    const delta=avg(last)-avg(first);
    return delta>0 ? [player(p,delta,`+${delta.toFixed(1)}`,`role percentile · ${avg(first).toFixed(1)} → ${avg(last).toFixed(1)} · ${first.length} / ${last.length} games`)] : [];
  }):[];
  add({id:"ascension",title:"The Ascension",family:"story",rule:`Largest gain in mean role-adjusted fantasy percentile before/after the league's median game timestamp${midpoint ? ` (${midpoint.slice(0,10)})` : ""}. Minimum 4 games in each half; positive gains only.`,unavailable:scoreUnavailable ?? (datesValid?undefined:"Missing game dates; award withheld.")},improvements);

  const duos=new Map<string,SeasonRow[]>();
  for(const batch of group(rows,r=>`${r.match_id}:${norm(r.team_name)}`).values()) {
    const adc=batch.filter(r=>role(r)==="adc"); const support=batch.filter(r=>role(r)==="support");
    if(adc.length!==1 || support.length!==1) continue;
    const k=`${key(adc[0])}|${key(support[0])}`;
    duos.set(k,[...(duos.get(k)??[]),adc[0],support[0]]);
  }
  add({id:"dynamic-duo",title:"Dynamic Duo",family:"team",rule:"Bot/support pairing with the most wins together. Minimum 4 games together; ties share the award."},[...duos.entries()].filter(([,p])=>p.length>=8).map(([k,p])=>({key:k,name:`${name(p[0])} + ${name(p[1])}`,champion:signature(p),value:p.filter(r=>r.win).length/2,display:String(p.filter(r=>r.win).length/2),evidence:`wins together · ${p.length/2} games · ${record(p.filter((_,i)=>i%2===0))}`})).filter(c=>c.value>0));
  const regularFixtures=fixtures.filter(f=>f.season===season && /^week_\d+$/.test(f.stage));
  const fixturesComplete=regularFixtures.length>0 && regularFixtures.every(f=>f.team_a && f.team_b && f.score_a!==null && f.score_b!==null && f.score_a!==f.score_b);
  const teams=group(rows,r=>norm(r.team_name));
  const ironmen=players.filter(p=>new Set(p.map(r=>norm(r.team_name))).size===1 && p.length>=8 && p.length===new Set(teams.get(norm(p[0].team_name))?.map(r=>r.match_id)).size).map(p=>player(p,p.length,`${p.length}/${p.length}`,`ingested team games · ${p[0].team_name} · ${record(p)}`));
  add({id:"ironman",title:"Ironman",family:"story",rule:"Every ingested regular-season game for one team, minimum 8 games. All qualifying players receive a card. Forfeits have no player appearances."},ironmen,true);
  const teamWinners:Winner[]=[];
  if(fixturesComplete) for(const [division,fs] of group(regularFixtures,f=>f.division??"League")) {
    const standings=new Map<string,{name:string;wins:number;losses:number}>();
    for(const f of fs) for(const [team,won] of [[f.team_a!,f.score_a!>f.score_b!],[f.team_b!,f.score_b!>f.score_a!]] as const) {const k=norm(team);const entry=standings.get(k)??{name:team,wins:0,losses:0};if(won)entry.wins++;else entry.losses++;standings.set(k,entry);}
    const candidates=[...standings].map(([k,t])=>({key:`${division}:${k}`,name:t.name,champion:signature(teams.get(k)??[]),value:t.wins,display:`${t.wins}–${t.losses}`,evidence:`${division} · series record · regular-season leader`,roster:[...new Set((teams.get(k)??[]).map(name))].sort()}));
    teamWinners.push(...best(candidates));
  }
  add({id:"winning-roster",title:"Regular-Season Royalty",family:"team",rule:"Most series wins in each division from completed regular-season fixtures, including forfeits. Ties share honors; roster lists all observed contributors. Withheld until every regular-season fixture has a decisive result.",unavailable:fixturesComplete?undefined:"Regular-season fixtures are missing or unfinished; winner not yet confirmed."},teamWinners,true);
  const warnings:string[]=[];
  if(excluded)warnings.push(`${excluded} stat rows excluded: incomplete or inconsistent matches. All cards remain provisional.`);
  if(!fixturesComplete)warnings.push("Regular-season schedule is incomplete. Player awards reflect currently ingested games only.");
  if(rows.length===0)warnings.push("No complete regular-season games found for this season.");
  return {awards, warnings, games:rows.length/10, players:players.length, excluded};
}
