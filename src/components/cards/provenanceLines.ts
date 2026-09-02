// The one-line bridge between the provenance action and the preview that
// shows it.
//
// Its own module because two client components want the same three steps —
// call the action, map the result to sentences, turn a refusal into null —
// and a copy of that in each is a copy that can drift. It lives beside the
// components rather than in src/lib because it reaches for a server action,
// which src/lib modules deliberately do not: those take a client and stay
// framework-free so a script can reuse them.

import { describeProvenance } from "@/lib/cards/provenance";
import { fetchProvenanceAction } from "@/lib/trades/actions";

/** This copy's chain as lines, or null when it couldn't be read — the shape
 *  CardCopyPreview's `loadProvenance` expects. */
export async function provenanceLinesFor(inventoryId: number): Promise<string[] | null> {
  const result = await fetchProvenanceAction(inventoryId);
  return result.ok ? describeProvenance(result.events) : null;
}
