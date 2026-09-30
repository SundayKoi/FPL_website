import "server-only";

// The expedition core. Takes a bare Discord id ON TRUST, so it is
// `server-only` and never exported from a "use server" module: ./actions.ts
// establishes who is calling and composes these, exactly the split
// packs/open.ts and packs/actions.ts keep. Exporting launchExpeditionFor
// from an action file would let any browser send anybody's cards out.
//
// Everything the odds and the gates depend on comes from ./config.ts and
// ./routes.ts, and the atomicity comes from the RPCs in
// supabase/migrations/20260914000001_expedition_routes.sql. The core is
// the seam: it reads the copies, applies the gates the UI also applies,
// rolls the outcome on a CSPRNG, and hands the result to the RPC that
// writes it once.
//
// The core is split by what it does, and this module is its one entry:
// ./actions.ts and the sweep route import from here, and their tests mock
// this path. The halves import each other directly, never through here.
//   runShared.ts  the result shapes, friendlyExpeditionError, the CSPRNG,
//                 and the run and convoy reads the others share
//   runLaunch.ts  launchExpeditionFor and decideForkFor
//   runClaim.ts   claimExpeditionFor and ransomLostCardFor
//   runSweep.ts   sweepExpeditions, the cron's pass

export {
  friendlyExpeditionError,
  type ClaimAtlas,
  type ClaimResult,
  type DecideResult,
  type LaunchOptions,
  type LaunchResult,
  type RansomResult,
} from "./runShared";
export { decideForkFor, launchExpeditionFor } from "./runLaunch";
export { claimExpeditionFor, ransomLostCardFor } from "./runClaim";
export { sweepExpeditions } from "./runSweep";
