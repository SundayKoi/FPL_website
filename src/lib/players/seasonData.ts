export type SeasonKey = "season-5" | "season-4" | "academy-1";

export interface PlayerEntry {
  name: string;
  rank: string;
  min: number;
  opggUrl: string;
}

export interface RoleSection {
  key: "top" | "jungle" | "mid" | "adc" | "support";
  label: string;
  players: PlayerEntry[];
}

export const SEASON_OPTIONS: { value: SeasonKey; label: string }[] = [
  { value: "season-5", label: "Season 5" },
  { value: "season-4", label: "Season 4" },
];

const season5Sections: RoleSection[] = [
  {
    key: "top",
    label: "Top",
    players: [
      { name: "Captain: Winter", rank: "M10", min: 30, opggUrl: "https://op.gg/lol/summoners/na/Winter-Ashtn" },
      { name: "Captain: Bleedinwolves", rank: "D2", min: 30, opggUrl: "https://op.gg/lol/summoners/na/Bleedinwolves-IlIll" },
      { name: "Captain: KingOfSpades", rank: "E2", min: 20, opggUrl: "https://op.gg/lol/summoners/na/KingOfSpades-205" },
      { name: "Captain: Sycoghost", rank: "E4", min: 10, opggUrl: "https://op.gg/lol/summoners/na/Sycoghost-1402" },
      { name: "Canny#rip", rank: "M10", min: 30, opggUrl: "https://op.gg/lol/summoners/na/Canny-rip" },
      { name: "Killer Python#NA1", rank: "D2", min: 25, opggUrl: "https://op.gg/lol/summoners/na/Killer%20Python-NA1" },
      { name: "Walt#0001", rank: "M10", min: 25, opggUrl: "https://www.op.gg/multisearch/na?summoners=Walt%230001%2CWalt%230002%2CHi+Walter%23NA1%2CWalt%23NILAH" },
      { name: "Rutledge#osu", rank: "E2", min: 20, opggUrl: "https://op.gg/lol/summoners/na/Rutledge-osu" },
      { name: "TheMooseRules#NA1", rank: "D3", min: 20, opggUrl: "https://op.gg/lol/summoners/na/TheMooseRules-NA1" },
      { name: "MMO#NA1", rank: "D4", min: 15, opggUrl: "https://op.gg/lol/multisearch/na?summoners=MMO%23NA1%2Cclash%20of%20clans%23NA1" },
      { name: "all gucci#gamer", rank: "D4", min: 10, opggUrl: "https://op.gg/fr/lol/multisearch/na?summoners=all+gucci%23gamer%2C+all+gucci%23na1" },
      { name: "Promech#NA1", rank: "E3", min: 10, opggUrl: "https://op.gg/lol/summoners/na/Promech-NA1" },
    ],
  },
  {
    key: "jungle",
    label: "Jungle",
    players: [
      { name: "Captain:Wellshowthemall", rank: "D3", min: 25, opggUrl: "https://op.gg/lol/multisearch/na?summoners=WellShowThemAll%23NA1%2CRATIRL+TEST+1%23NA1%2Cnormal+jungler%23XDD" },
      { name: "Captain:Metashift", rank: "D4", min: 15, opggUrl: "https://op.gg/lol/summoners/na/Metashift-2281" },
      { name: "Captain: Lizzo Mukkbang", rank: "E3", min: 10, opggUrl: "https://op.gg/lol/summoners/na/Lizzo%20Mukkbang-Mukk" },
      { name: "Pinei nessa poha#00027", rank: "M10", min: 30, opggUrl: "https://op.gg/lol/summoners/na/Pinei%20nessa%20poha-00027" },
      { name: "Superbeans#222", rank: "D2", min: 25, opggUrl: "https://op.gg/fr/lol/summoners/na/Superbeans-222" },
      { name: "Angrodis", rank: "D4", min: 20, opggUrl: "https://op.gg/lol/summoners/na/Angrodis-NA1" },
      { name: "Crabadabadoo", rank: "D4", min: 20, opggUrl: "https://op.gg/lol/summoners/na/Crabadabadoo-NA1" },
      { name: "i fear nobody#na1", rank: "D4", min: 20, opggUrl: "https://op.gg/lol/summoners/na/i%20fear%20nobody-na1" },
      { name: "Conguitos#01203", rank: "E2", min: 10, opggUrl: "https://op.gg/lol/summoners/na/Conguitos-01203" },
      { name: "DeathMasterPwnz2#NARC", rank: "E3", min: 10, opggUrl: "https://op.gg/lol/summoners/na/DeathMasterPwnz2-NARC" },
      { name: "Sir Joey#Valor", rank: "E2", min: 10, opggUrl: "https://op.gg/lol/summoners/na/SirJoey-Valor" },
      { name: "ΣΠΑΡΤΙΑΤΗΣ #Sprtn", rank: "E2", min: 10, opggUrl: "https://op.gg/lol/summoners/na/%CE%A3%CE%A0%CE%91%CE%A1%CE%A4%CE%99%CE%91%CE%A4%CE%97%CE%A3-Sprtn" },
    ],
  },
  {
    key: "mid",
    label: "Mid",
    players: [
      { name: "Captain: YRW", rank: "D4", min: 20, opggUrl: "https://op.gg/lol/summoners/na/YRW-NA1" },
      { name: "Captain: Flying Squirtle", rank: "D4", min: 15, opggUrl: "https://op.gg/lol/summoners/na/Flyinq%20Squirtle-NA1" },
      { name: "SlimPimpin77#epic", rank: "D1", min: 30, opggUrl: "https://op.gg/lol/summoners/na/SlimPimpin77-epic" },
      { name: "JayDK#NA1", rank: "D3", min: 25, opggUrl: "https://op.gg/lol/summoners/na/JayDK-NA1" },
      { name: "LotusB5#999", rank: "D2", min: 25, opggUrl: "https://op.gg/lol/summoners/na/LotusB5-999" },
      { name: "Zoodiac#すべて同じ", rank: "D2", min: 25, opggUrl: "https://op.gg/lol/summoners/na/Zoodiac-%E3%81%99%E3%81%B9%E3%81%A6%E5%90%8C%E3%81%98" },
      { name: "Cherrie", rank: "D4", min: 20, opggUrl: "https://op.gg/lol/summoners/na/Cherrie-coke" },
      { name: "GratxAce#NA1", rank: "D4", min: 20, opggUrl: "https://op.gg/lol/summoners/na/GratxAce-NA1" },
      { name: "solomon#meow", rank: "D3", min: 20, opggUrl: "https://op.gg/lol/summoners/na/solomon-meow" },
      { name: "FeralEevee#133", rank: "E4", min: 15, opggUrl: "https://op.gg/lol/summoners/na/FeralEevee-133" },
      { name: "Quetips#na1", rank: "E1", min: 15, opggUrl: "https://op.gg/lol/summoners/na/Quetips-na1" },
      { name: "YWGI#rain", rank: "E1", min: 15, opggUrl: "https://op.gg/lol/summoners/na/YWGI-rain" },
    ],
  },
  {
    key: "adc",
    label: "ADC",
    players: [
      { name: "Captain: 7Gen", rank: "D4", min: 20, opggUrl: "https://op.gg/lol/summoners/na/7Gen-4444" },
      { name: "Captain:IEnders", rank: "E2", min: 15, opggUrl: "https://op.gg/lol/summoners/na/iEnders-jett" },
      { name: "Matrix#NA101", rank: "M90", min: 30, opggUrl: "https://op.gg/lol/summoners/na/Matrix-NA101" },
      { name: "VIP Peekaboo#VIP", rank: "M10", min: 25, opggUrl: "https://op.gg/lol/multisearch/na?summoners=VIP+Peekaboo%23VIP%2CToplanegodmn%23NA1%2Czpfngvx%23NA1%2Cfgvunlldw%23NA1" },
      { name: "Dariss#na1", rank: "D4", min: 20, opggUrl: "https://op.gg/lol/summoners/na/Dariss-na1" },
      { name: "Thunder Master#BLOOD", rank: "D3", min: 20, opggUrl: "https://op.gg/lol/summoners/na/Thunder%20Master-BLOOD" },
      { name: "Humble#btc", rank: "E3", min: 15, opggUrl: "https://op.gg/lol/summoners/na/Humble-btc" },
      { name: "the grip reaper #meow", rank: "D4", min: 15, opggUrl: "https://op.gg/lol/summoners/na/the%20grip%20reaper-meow" },
      { name: "Nickle#2537", rank: "E3", min: 10, opggUrl: "https://op.gg/lol/summoners/na/Nickle-2537" },
      { name: "Imperialarcher#ezpz", rank: "E3", min: 10, opggUrl: "https://op.gg/lol/summoners/na/Imperialarcher-ezpz" },
      { name: "Lolcavan#NA1", rank: "E3", min: 10, opggUrl: "https://op.gg/lol/summoners/na/Lolcavan-NA1" },
      { name: "SeeU#Xiyue", rank: "E2", min: 10, opggUrl: "https://op.gg/lol/multisearch/na?summoners=SeeU%23Xiyue%2CBad+AppIe%23NA1" },
    ],
  },
  {
    key: "support",
    label: "Support",
    players: [
      { name: "Captain: Spies", rank: "D4", min: 20, opggUrl: "https://op.gg/lol/summoners/na/Spies-6313" },
      { name: "Aura#5950", rank: "M10", min: 30, opggUrl: "https://op.gg/lol/summoners/na/Aura-5950" },
      { name: "Chief#1160", rank: "M10", min: 30, opggUrl: "https://op.gg/lol/multisearch/na?summoners=chief%231160%2CXericon%231408" },
      { name: "Doug#LIMU", rank: "D2", min: 25, opggUrl: "https://op.gg/lol/multisearch/na?summoners=doug%23limu%2C+master+reigen%23mob%2C" },
      { name: "Qball#1032", rank: "D2", min: 25, opggUrl: "https://op.gg/lol/multisearch/na?summoners=QBall%231032%2C+TBall%232310%2C+JBall%231032%2C" },
      { name: "Beg#DU1", rank: "D4", min: 20, opggUrl: "https://op.gg/lol/summoners/na/Beg-DU1" },
      { name: "08 Mitsu Eclipse#Chime", rank: "D4", min: 15, opggUrl: "https://op.gg/lol/summoners/na/08%20Mitsu%20Eclipse-Chime" },
      { name: "WrathOfSath", rank: "E1", min: 15, opggUrl: "https://op.gg/lol/summoners/na/WrathOfSath-NA1" },
      { name: "Boat chicken#na1", rank: "E2", min: 10, opggUrl: "https://op.gg/lol/multisearch/na?summoners=Boat%20chicken%23na1%2C%20Lance%20steele%23lance" },
      { name: "I am atomic#idk", rank: "E4", min: 10, opggUrl: "https://op.gg/lol/summoners/na/I%20am%20atomic-idk" },
      { name: "Pr1mus#NA1", rank: "E4", min: 10, opggUrl: "https://op.gg/lol/multisearch/na?summoners=Pr1mus%23NA1%2CIWillCrankYou%23hookd" },
      { name: "UnluckyCanadian#CDN", rank: "E3", min: 10, opggUrl: "https://op.gg/lol/summoners/na/UnluckyCanadian-CDN" },
    ],
  },
];

export const PLAYER_SEASONS: Record<SeasonKey, RoleSection[]> = {
  "season-5": season5Sections,
  "season-4": [],
  "academy-1": [],
};
