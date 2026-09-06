// The finishes, announced: one embed for the cards channel that says what
// is new in packs and where every rarity is explained. Pure, like the
// Gauntlet's — every number comes from the config that rolls it.

import { SECRET_CHANCE, SECRET_DUST_MULT, SHINY_CHANCE, SHINY_DUST_MULT, STATTRAK_CHANCE } from "@/lib/packs/config";
import { oneIn, perPackPct } from "./rarityGuide";

export interface AnnouncementEmbed {
  title: string;
  description: string;
  color: number;
}

const GOLD = 0xe8c14b;

/** The announcement, with the link the guide lives behind. */
export function rarityAnnouncement(siteUrl: string): AnnouncementEmbed {
  const base = siteUrl.replace(/\/$/, "");
  const guide = `${base}/cards/rarities`;
  const packs = `${base}/cards/packs`;
  const lines = [
    "Three new things a card can come out of a pack as. All three are live in every pack from now on — premier and academy, any week's edition, the daily rip included.",
    "",
    `**★ Shiny — ${oneIn(SHINY_CHANCE)} cards (${perPackPct(SHINY_CHANCE)}).** The same card in the wrong colours: the art hue-shifted with a sparkle over it. Can be foil, can be signed. Dusts ×${SHINY_DUST_MULT}.`,
    "",
    `**📟 StatTrak™ — ${oneIn(STATTRAK_CHANCE)} cards (${perPackPct(STATTRAK_CHANCE)}).** A counter on the card that tracks the player's Fantasy Pts (the stats tab's tally) for every game they play while YOU hold it — fielded or not. Trade it and it resets to zero for the new owner.`,
    "",
    `**🔒 Secret — ${oneIn(SECRET_CHANCE)} cards.** A print numbered past the checklist: in a 120-card season the first Secret found is #121/120. Gold inside the frame, one per pack at most, announced here when it lands. Dusts ×${SECRET_DUST_MULT}, and auto-dust will never touch one.`,
    "",
    "**🛡️ Wear and slabbing.** Every copy now wears its history — Factory New until it is fielded, then Minimal Wear, Field-Tested, Well-Worn, Battle-Scarred as the expeditions, Gauntlet runs and Fantasy weeks add up. Slab a copy from its drawer on your collection to seal its grade forever: it can still be sold or traded, but it can never be fielded again.",
    "",
    "Nothing else moved: the tiers, the foil ladder, the autograph rate and the Eclipse are exactly what they were. The finishes roll on top, after all of them.",
    "",
    `Every rarity a card can pull, with the real odds: ${guide}`,
    `Packs: ${packs}`,
  ];
  return { title: "✨ New in packs: Shiny, StatTrak and Secret", description: lines.join("\n"), color: GOLD };
}
