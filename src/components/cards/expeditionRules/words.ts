// The next level of the rules: edges, the road ahead, the camp, the league,
// the atlas. Each has its own section module beside this one.
//
// Plain words first, the game's word second. The board says "power" where
// the rest of this rulebook says "shine", and "landmark" is the league
// goal's word, so a place named after whoever reached it first is said as
// exactly that.

/** "one map fragment", "2 map fragments". */
export function fragmentsWord(n: number): string {
  return `${n === 1 ? "one" : n} map fragment${n === 1 ? "" : "s"}`;
}
