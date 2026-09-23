// The expedition actions as the staff preview (/admin/expedition-board)
// runs them: nothing is sent. Every press answers with the same refusal,
// so the preview also shows where each error lands on the board. A plain
// module of async functions the board picks instead of the server actions
// when it is rendered with `preview`.

import type { CampActionResult, CampaignActionResult } from "@/lib/expeditions/actions";
import type { ClaimResult, DecideResult, LaunchResult, RansomResult } from "@/lib/expeditions/runs";

export const PREVIEW_REFUSAL = "This is a preview: nothing was sent.";

export const PREVIEW_ACTIONS = {
  launchExpeditionAction: async (): Promise<LaunchResult> => ({ ok: false, error: PREVIEW_REFUSAL }),
  decideForkAction: async (): Promise<DecideResult> => ({ ok: false, error: PREVIEW_REFUSAL }),
  claimExpeditionAction: async (): Promise<ClaimResult> => ({ ok: false, error: PREVIEW_REFUSAL }),
  ransomLostCardAction: async (): Promise<RansomResult> => ({ ok: false, error: PREVIEW_REFUSAL }),
  startCampaignAction: async (): Promise<CampaignActionResult> => ({ ok: false, error: PREVIEW_REFUSAL }),
  abandonCampaignAction: async (): Promise<CampaignActionResult> => ({ ok: false, error: PREVIEW_REFUSAL }),
  upgradeCampAction: async (): Promise<CampActionResult> => ({ ok: false, error: PREVIEW_REFUSAL }),
  forgePolicyAction: async (): Promise<CampActionResult> => ({ ok: false, error: PREVIEW_REFUSAL }),
};
