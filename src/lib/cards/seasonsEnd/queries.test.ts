import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSeasonsEnd } from "./queries";
describe("season query scope",()=>{
 it("paginates season discovery and enforces league/phase filters even for a forged season",async()=>{
  const calls:{table:string;filters:unknown[][];range:number[]}[]=[];
  const client={from(table:string){const call={table,filters:[] as unknown[][],range:[] as number[]};calls.push(call);const q={select(){return q},order(){return q},eq(...a:unknown[]){call.filters.push(a);return q},in(...a:unknown[]){call.filters.push(a);return q},range(from:number,to:number){call.range=[from,to];return Promise.resolve({data:table==="stats_player_agg" ? from===0?Array.from({length:1000},()=>({season:"S5"})):[{season:"A1"}] : [],error:null})}};return q}};
  const result=await fetchSeasonsEnd(client as unknown as SupabaseClient,"academy","S5");
  expect(result.options).toEqual(["A1"]);expect(result.season).toBe("A1");expect(calls.filter(c=>c.table==="stats_player_agg").map(c=>c.range[0])).toEqual([0,1000]);
  expect(calls.find(c=>c.table==="raw_stats")?.filters).toEqual([["season","A1"],["season_phase","Regular"]]);
  expect(calls.find(c=>c.table==="fixtures")?.filters[0]).toEqual(["season","A1"]);
 });
 it("propagates database errors",async()=>{const error=new Error("database unavailable");const q={select(){return q},order(){return q},range(){return Promise.resolve({data:null,error})}};await expect(fetchSeasonsEnd({from:()=>q} as unknown as SupabaseClient,"premier")).rejects.toThrow("database unavailable");});
});
