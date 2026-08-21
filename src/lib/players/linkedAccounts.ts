import { normalizePlayerName } from "./freeAgency";

/**
 * Player OP.GG account links, keyed by normalized player name. Source: the
 * league's account-tracking sheet (players self-report their smurfs there),
 * imported 2026-08-21. Multi-account players point at an OP.GG multisearch;
 * a few list more than one link (extra accounts on other regions, etc.).
 * Raw "Name#TAG" entries from the sheet are stored as constructed summoner
 * URLs. Players with an empty sheet row simply aren't listed.
 */
const LINKED_ACCOUNTS: Record<string, string[]> = {
  "08 mitsu eclipse": ["https://op.gg/fr/lol/multisearch/na?summoners=08MitsuEclipse%23chime%2Cleaf%23link"],
  "7gen": ["https://op.gg/lol/multisearch/na?summoners=7gen%234444%2C7genoff%23NA1%2CMidgapkinggod%23mdgap%2C"],
  "all gucci": ["https://op.gg/lol/multisearch/na?summoners=all+gucci%23gamer%2C+all+gucci%23na1"],
  "angrodis": ["https://op.gg/lol/summoners/na/Angrodis-na1"],
  "aura": ["https://op.gg/lol/multisearch/na?summoners=Aura%235950%2C+Aura%231530%2C+Jane+Remover%235737%2C%2C"],
  "beg": [
    "https://op.gg/lol/multisearch/na?summoners=Beg%23Ripbe%2Cbegfourmercy%23NA1%2CBeg%23Beg7%2CBeg%23Beg8%2Cbegfortanks%23na1%2CBeg%23beg6%2CBeg%23Beg10%2CBeg%23Beg4%2CRakan+Man%23NA%2C1begforsilver%23NA1%2CBeg%23Beg5%2CBeg%23Beg72%2CMHS+Beg%23NA1%2CBeg%23Beg4%2Cwmu+beg%23NA1%2CTPG+Beg%23NA1%2Cbeg%23du1%2Cbegfourmercy%23NA1",
  ],
  "cherrie": [
    "https://op.gg/lol/multisearch/na?summoners=cherrie%23coke%2CCut+Through+Fate%23DRAW1%2CLove+Quinn%23Hope%2CKallen%23Kzk%2CSwords+Dance%23TM75",
  ],
  "chief": ["https://op.gg/lol/multisearch/na?summoners=Chief%231160%2CXericon%231408"],
  "conguitos": ["https://op.gg/lol/summoners/na/Conguitos0-01203"],
  "crabadabadoo": [
    "https://op.gg/lol/multisearch/na?summoners=crabadabadoo%23NA1%2C+CANTPUTDOWNDACUP%23NA0%2C+boostedbimbo%23NA0%2C+Caseohbackbling%23NA2%2C+Magemaw%2C",
  ],
  "dariss": ["https://op.gg/lol/multisearch/na?summoners=Dariss%23NA1%2CBerryXXL%23NA1"],
  "deathmasterpwnz2": [
    "https://op.gg/fr/lol/multisearch/na?summoners=DeathMasterPwnz2%23NARC%2CDeathMasterPwnz%23NA1%2CDeathMasterPwnz3%23NA1%2CDeathMasterPwnz5%23NA1",
  ],
  "doug": ["https://op.gg/lol/multisearch/na?summoners=Doug%23LIMU%2CMaster+Reigen%23Mob"],
  "flying squirtle": ["https://op.gg/fr/lol/multisearch/na?summoners=bigboynaruto%23na1%2Cflyinq+squirtle%23na1"],
  "gratxace": ["https://op.gg/lol/summoners/na/GratxAce-NA1"],
  "humble": ["https://op.gg/fr/lol/multisearch/na?summoners=Humble%23btc%2CHumble%23Legit%2CBaldwinWode%23woke%2Csxlbf%2CTommy2Quick%232quik"],
  "i am atomic": ["https://op.gg/fr/lol/summoners/na/I%20am%20ATOMIC-4782"],
  "ienders": ["https://op.gg/fr/lol/summoners/na/iEnders-jett"],
  "imperialarcher": ["https://op.gg/lol/multisearch/na?summoners=Imperialarcher%23ezpz%2CRidgeway%23NA1"],
  "kingofspades": ["https://op.gg/lol/summoners/na/KingOfSpades-205"],
  "lizzo mukkbang": ["https://op.gg/lol/summoners/na/Lizzo%20Mukkbang-Mukk"],
  "lotusb5": [
    "https://op.gg/lol/multisearch/na?summoners=LotusB5%23999%2C+Lucidiums%23NA1%2C+Lucidium%23NA1%2C+Gynnidcentr%23NA1%2C+LucidiumIsMid%239999%2C+LucidiumIsBored%23NA1%2C%2C",
  ],
  "matrix": ["https://op.gg/fr/lol/multisearch/na?summoners=Matrix%23NA101%2CTeam+Leader+Q%23NA2"],
  "metashift": [
    "https://op.gg/lol/multisearch/na?summoners=MeatShaft%232281%2CRedHeadDestroyer%23PAWG%2CUtility+Engineer%232281%2CMoobSmack%232281%2CNeekos+Large+Rod%23NA1%2CDortressFoor%23TMG%2CMetaShift%232281%2CSuck+Me+Jorts%23NA1",
  ],
  "mmo": [
    "https://op.gg/lol/multisearch/na?summoners=Drexnezod%23NA1%2Cdental+floss%23NA1%2Cclash+of+clans%23NA1%2Chappyhippo%23dead%2Csadroad%23NA1%2CMMO%23NA1",
  ],
  "nickle": ["https://op.gg/lol/summoners/na/Nickle-2537"],
  "pr1mus": ["https://op.gg/lol/summoners/na/Pr1mus-NA1", "https://op.gg/lol/summoners/na/IWillCrankYou-hookd"],
  "promech": ["https://op.gg/lol/summoners/na/Promech-NA1", "https://op.gg/lol/summoners/lan/avuelo%20bipolar-ElPro"],
  "qball": ["https://op.gg/lol/multisearch/na?summoners=QBall%231032%2CJBall%231032%2CTheBouncy%23Ball"],
  "quetips": ["https://op.gg/lol/summoners/na/Quetips-NA1"],
  "rutledge": ["https://op.gg/lol/summoners/na/Rutledge-osu"],
  "seeu": ["https://op.gg/lol/multisearch/na?summoners=SeeU%23Xiyue%2CBad+AppIe%23NA1"],
  "sir joey": ["https://op.gg/fr/lol/multisearch/na?summoners=SirJoey%23Valor%2CSir+Joey%23Honor"],
  "slimpimpin77": ["https://op.gg/lol/summoners/na/SlimPimpin77-epic"],
  "solomon": ["https://op.gg/fr/lol/summoners/na/Solomon-meow"],
  "spies": ["https://op.gg/fr/lol/multisearch/na?summoners=Spies%236313%2C+flash+on+crab%23NA1%2C"],
  "superbeans": ["https://op.gg/lol/summoners/na/Superbeans-222"],
  "themooserules": ["https://op.gg/lol/multisearch/na?summoners=TheMooseRules%23NA1%2CSUPERWAHOOGAMER%23COMBO%2CTheMeepForger%23NA1"],
  "thunder master": ["https://op.gg/fr/lol/multisearch/na?summoners=Thunder+Master%23BLOOD%2CTSM+BAKI%23NA2%2C"],
  "unluckycanadian": ["https://op.gg/lol/summoners/na/UnluckyCanadian-CDN"],
  "vip peekaboo": [
    "https://op.gg/lol/multisearch/na?summoners=VIP+Peekaboo%23VIP%2CToplanegodmn%23NA1%2Czpfngvx%23NA1%2Cfgvunlldw%23NA1",
  ],
  "walt": ["https://op.gg/lol/multisearch/na?summoners=Walt%230001%2CWalt%230002%2CHi+Walter%23NA1%2CWalt%23NILAH"],
  "wellshowthemall": ["https://op.gg/lol/multisearch/na?summoners=WellShowThemAll%23NA1%2Cnormal+jungler%23XDD"],
  "winter": ["https://op.gg/lol/multisearch/na?summoners=Winter%23Ashtn%2CTheDevilKilling%23NA1"],
  "yrw": ["https://op.gg/da/lol/multisearch/na?summoners=YRW%23NA1%2COrdinary%23NA2"],
  "ywgi": ["https://op.gg/lol/summoners/na/YWGI-Rain"],
  "zoodiac": ["https://op.gg/lol/multisearch/na?summoners=Zoodiac%23すべて同じ"],
  // Stored in the capital form the roster uses: Greek lowercasing turns a
  // trailing Σ into ς, so the normalized key must come from the same input.
  "ΣΠΑΡΤΙΑΤΗΣ": ["https://op.gg/lol/summoners/na/%CE%A3%CE%A0%CE%91%CE%A1%CE%A4%CE%99%CE%91%CE%A4%CE%97%CE%A3-Sprtn"],
};

// Both the sheet names above and lookup names go through the SAME
// normalization (aliases like "08 mitsu eclipse"→"chime", NFKC, final-sigma
// lowercasing, etc.), so the two sides can never drift apart.
const NORMALIZED_ACCOUNTS = new Map(
  Object.entries(LINKED_ACCOUNTS).map(([name, urls]) => [normalizePlayerName(name), urls]),
);

/** Every linked OP.GG URL for a player (empty when the sheet has none). */
export function linkedAccountUrls(name: string): string[] {
  return NORMALIZED_ACCOUNTS.get(normalizePlayerName(name)) ?? [];
}

/** The player's primary OP.GG link, or null. */
export function primaryLinkedAccountUrl(name: string): string | null {
  return linkedAccountUrls(name)[0] ?? null;
}

/** A short human label for one linked URL: multisearches cover all a
 *  player's accounts, single-summoner pages are one account. */
export function linkedAccountLabel(url: string, index: number): string {
  const multi = url.includes("/multisearch/");
  if (multi) return "OP.GG · all accounts";
  return index === 0 ? "OP.GG" : `OP.GG · account ${index + 1}`;
}
