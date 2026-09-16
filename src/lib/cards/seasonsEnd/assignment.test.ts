import { describe, expect, it } from "vitest";
import { assignChampions } from "./assignment";
const c = (playerKey:string,champion:string,value:number) => ({playerKey,champion,value});
describe("unique champion allocation",()=>{
  it("reroutes a flexible player rather than stranding a one-champion player",()=>{
    expect(assignChampions([c("A","Ahri",100),c("A","Azir",10),c("B","Ahri",90)]))
      .toEqual([c("A","Azir",10),c("B","Ahri",90)]);
  });
  it("maximizes combined quality after maximizing coverage",()=>{
    expect(assignChampions([c("A","Ahri",100),c("A","Azir",99),c("B","Ahri",98),c("B","Azir",1)]))
      .toEqual([c("A","Azir",99),c("B","Ahri",98)]);
  });
  it("returns only real assignments when coverage is impossible and is order-independent",()=>{
    const input=[c("A","Ahri",50),c("B","Ahri",50),c("C","Ahri",40)];
    expect(assignChampions(input)).toHaveLength(1);
    expect(assignChampions([...input].reverse())).toEqual(assignChampions(input));
    expect(assignChampions([])).toEqual([]);
  });
});
