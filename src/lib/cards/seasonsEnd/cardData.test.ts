import { describe, expect, it } from "vitest";
import { sampleCard } from "@/lib/cards/samples";
import { awardPlayerCard } from "./cardData";
import type { Winner } from "./awards";
const winner:Winner={key:"player:Ahri",name:"Player",champion:"Ahri",championGames:2,value:88,display:"88",evidence:"Ahri · 2–0 · 2 games",title:"Best of Ahri"};
describe("normal card award treatment",()=>{
 it("preserves the season rating and stats while labeling the assigned champion",()=>{
  const original=sampleCard();const card=awardPlayerCard(original,winner,"Best of Champion");
  expect(card.overall).toBe(original.overall);expect(card.subStats).toEqual(original.subStats);
  expect(card.archetype).toBe("Best of Ahri");expect(card.signature).toEqual({champion:"Ahri",games:2});
  expect(card.motto).toBe(winner.evidence);expect(original.archetype).not.toBe("Best of Ahri");
 });
 it("leaves normal cumulative season cards intact",()=>{
  const original=sampleCard();const {championGames:_,...seasonWinner}=winner;
  void _;
  expect(awardPlayerCard(original,seasonWinner,"Season Cards",true)).toEqual(original);
 });
});
