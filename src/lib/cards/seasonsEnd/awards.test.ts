import { describe, expect, it } from "vitest";
import { buildSeasonAwards, type SeasonRow, type SeasonFixture } from "./awards";
function game(n:number, season="S5"):SeasonRow[] {
  return Array.from({length:10},(_,i)=>({id:n*10+i,season,season_phase:"Regular",match_id:`${season}-${n}`,summoner_name:`Player${i}`,tag:"NA1",team_name:i<5?"Alpha":"Beta",role:["TOP","JUNGLE","MIDDLE","BOTTOM","UTILITY"][i%5],champion:["Garen","Vi","Ahri","Jinx","Lulu","Ornn","Lee Sin","Azir","Ashe","Braum"][i],game_date:`2026-09-${String(n+1).padStart(2,"0")}T00:00:00Z`,game_duration_min:30,kills:i===0?10:2,deaths:2,assists:5,solo_kills:i===0?3:0,turret_damage:i===0?1000:10,healing_on_teammates:i===4?1000:0,vision_score:i===4?100:10,cs_per_min:5,damage_share_pct:20,kill_participation_pct:50,win:i<5}));
}
const fixtures:SeasonFixture[]=[{id:"f",season:"S5",stage:"week_1",division:"Solari",team_a:"Alpha",team_b:"Beta",score_a:2,score_b:0}];
const rows=()=>Array.from({length:8},(_,n)=>game(n)).flat();
const award=(r:ReturnType<typeof buildSeasonAwards>,id:string)=>r.awards.find(a=>a.id===id)!;
describe("season award decisions",()=>{
 it("scores all twelve families from complete regular games without cross-season/playoff contamination",()=>{
  const input=[...rows(),...game(9,"A1"),...game(10).map(r=>({...r,season_phase:"Playoffs",kills:999}))];
  const result=buildSeasonAwards(input,fixtures,"S5");expect(result.games).toBe(8);expect(result.awards).toHaveLength(12);
  expect(award(result,"body-count").winners[0]).toMatchObject({name:"Player0#NA1",value:80});
  expect(award(result,"duelist").winners[0].value).toBe(24);
  expect(award(result,"wrecking-ball").winners[0].value).toBe(8000);
  expect(award(result,"guardian-angel").winners[0].value).toBe(8000);
  expect(award(result,"all-seeing").winners[0].value).toBeCloseTo(100/30);
  expect(award(result,"best-of-champion").winners).toHaveLength(10);
  expect(award(result,"dynamic-duo").winners[0]).toMatchObject({name:"Player3#NA1 + Player4#NA1",value:340});
  expect(award(result,"season-cards").winners).toHaveLength(10);
  expect(award(result,"undefeated").winners[0]).toMatchObject({name:"Alpha",display:"2–0"});
 });
 it("retains exact ties and refuses missing metric data",()=>{
  const input=rows().map(r=>({...r,kills:5,healing_on_teammates:r.id===0?null:r.healing_on_teammates}));
  const result=buildSeasonAwards(input,fixtures,"S5");
  expect(award(result,"body-count").winners).toHaveLength(10);
  expect(award(result,"guardian-angel").winners).toEqual([]);
  expect(award(result,"guardian-angel").unavailable).toContain("Missing");
 });
 it("excludes incomplete and duplicate matches instead of inflating awards",()=>{
  const input=[...game(0).slice(1),...game(1),game(1)[0],...game(2)];const result=buildSeasonAwards(input,fixtures,"S5");
  expect(result.games).toBe(1);expect(result.excluded).toBe(20);expect(award(result,"best-of-champion").winners).toHaveLength(10);
 });
 it("uses duration-weighted vision rather than averaging game rates",()=>{
  const input=rows().map(r=>({...r,game_duration_min:r.match_id==="S5-0"?60:20}));
  expect(award(buildSeasonAwards(input,fixtures,"S5"),"all-seeing").winners[0].value).toBe(800/200);
 });
 it("requires complete fixtures for undefeated teams and does not select a playoff winner",()=>{
  const result=buildSeasonAwards(rows(),[...fixtures,{...fixtures[0],id:"pending",score_a:null}, {...fixtures[0],stage:"finals",score_a:0,score_b:3}],"S5");
  expect(award(result,"undefeated").winners).toEqual([]);
 });
 it("rewards a genuine second-half improvement and excludes undersampled players",()=>{
  const input=rows().map(r=>({...r,kills:r.summoner_name==="Player0" && Number(r.match_id?.split("-")[1])>=4?30:r.kills}));
  const result=buildSeasonAwards(input,fixtures,"S5");expect(award(result,"ascension").winners[0].name).toBe("Player0#NA1");expect(award(result,"ascension").winners[0].value).toBeGreaterThan(0);
  expect(award(buildSeasonAwards(game(0),fixtures,"S5"),"all-seeing").winners).toEqual([]);
 });
 it("awards rare pocket picks only when all appearance, rarity, and win requirements hold",()=>{
  const input=Array.from({length:40},(_,n)=>game(n).map(r=>({...r,game_date:"2026-09-01T00:00:00Z",champion:r.summoner_name==="Player0"&&n<4?"Teemo":r.champion}))).flat();
  expect(award(buildSeasonAwards(input,fixtures,"S5"),"pocket-pick").winners[0].champion).toBe("Teemo");
  expect(award(buildSeasonAwards(input.slice(10),fixtures,"S5"),"pocket-pick").winners).toEqual([]);
 });
 it("requires strictly more than five appearances for season cards",()=>{
  expect(award(buildSeasonAwards(rows().slice(0,50),fixtures,"S5"),"season-cards").winners).toEqual([]);
  expect(award(buildSeasonAwards(rows().slice(0,60),fixtures,"S5"),"season-cards").winners).toHaveLength(10);
 });
 it("assigns one played champion to every player with no champion repeats",()=>{
  const result=buildSeasonAwards(rows(),fixtures,"S5");
  const winners=award(result,"best-of-champion").winners;
  expect(new Set(winners.map(w=>w.playerKeys![0])).size).toBe(10);
  expect(new Set(winners.map(w=>w.champion)).size).toBe(10);
  for(const winner of winners) expect(winner.title).toBe(`Best of ${winner.champion}`);
 });
 it("reports impossible coverage without inventing champions",()=>{
  const input=rows().map(r=>({...r,champion:"Ahri"}));
  const result=buildSeasonAwards(input,fixtures,"S5");
  expect(award(result,"best-of-champion").winners).toHaveLength(1);
  expect(result.warnings.join(" ")).toContain("1/10 players");
 });
 it("ranks bot lane cumulative stats independently of wins",()=>{
  const input=rows().map(r=>({...r,kills:r.summoner_name==="Player8"?30:r.kills}));
  const result=buildSeasonAwards(input,fixtures,"S5");
  expect(award(result,"dynamic-duo").winners[0].name).toBe("Player8#NA1 + Player9#NA1");
  const reversed=input.map(r=>({...r,win:!r.win}));
  expect(award(buildSeasonAwards(reversed,fixtures,"S5"),"dynamic-duo").winners).toEqual(award(result,"dynamic-duo").winners);
 });
 it("does not call a team undefeated when it wins every series but loses a game",()=>{
  expect(award(buildSeasonAwards(rows(),[{...fixtures[0],score_b:1}],"S5"),"undefeated").winners).toEqual([]);
  const input=rows().map(r=>r.match_id==="S5-0"?{...r,win:!r.win}:r);
  expect(award(buildSeasonAwards(input,fixtures,"S5"),"undefeated").winners).toEqual([]);
 });

 it("treats champion aliases as one unique champion",()=>{
  const input=rows().map(r=>({...r,champion:r.id%2 ? "MonkeyKing" : "Wukong"}));
  const winners=award(buildSeasonAwards(input,fixtures,"S5"),"best-of-champion").winners;
  expect(winners).toHaveLength(1);expect(winners[0].title).toBe("Best of Wukong");
 });

});
