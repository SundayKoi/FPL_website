const sectionHeadingClass =
  "scroll-mt-24 border-b border-line pb-3 font-display text-2xl font-semibold text-white sm:text-3xl";
const subsectionHeadingClass =
  "scroll-mt-24 pt-3 font-display text-xl font-semibold text-white";
const minorHeadingClass =
  "scroll-mt-24 pt-2 font-display text-lg font-semibold text-white";
const paragraphClass = "max-w-4xl text-steel";
const listClass = "max-w-4xl list-disc space-y-2 pl-6 text-steel";
const orderedListClass = "max-w-4xl list-decimal space-y-2 pl-6 text-steel";

export default function RulebookContent() {
  return (
    <article
      aria-labelledby="rulebook-title"
      className="space-y-10 text-sm leading-7 sm:text-base"
    >
      <header className="space-y-4">
        <h1
          id="rulebook-title"
          className="scroll-mt-24 font-display text-4xl font-semibold text-white sm:text-5xl"
        >
          Franchise Premier League (FPL) Official Rulebook
        </h1>
      </header>

      <section aria-labelledby="league-statement" className="space-y-5">
        <h2 id="league-statement" className={sectionHeadingClass}>
          League Statement:
        </h2>
        <p className={paragraphClass}>Hey everyone!</p>
        <p className={paragraphClass}>
          We’re excited to have you join us for the Franchise Premier League (FPL) – a brand-new competitive league where esports franchises compete.
        </p>
        <h3 className={subsectionHeadingClass}>What is the FPL?</h3>
        <ul className={listClass}>
          <li>The FPL is a franchise-based league featuring multiple established organizations.</li>
          <li>Each franchise “owns” a team roster and competes against other franchises throughout the season.</li>
          <li>The league is structured to create balanced, competitive matches and showcase emerging talent.</li>
        </ul>
        <h3 className={subsectionHeadingClass}>Player Sign-Ups</h3>
        <p className={paragraphClass}>
          All players who want to compete sign up to join the “player pool.”
        </p>
        <p className={paragraphClass}>
          <a
            className="text-gold underline decoration-gold/50 underline-offset-4 hover:text-white"
            href="https://forms.gle/rKdxaVfXnvAhD8wQA"
            rel="noopener noreferrer"
            target="_blank"
          >
            https://forms.gle/rKdxaVfXnvAhD8wQA
          </a>
        </p>
        <p className={paragraphClass}>
          This pool is basically the list of everyone available to be picked by teams.
        </p>
        <p className={paragraphClass}>
          When you sign up, you’ll provide info like your role (Top, Jungle, Mid, ADC, or Support), your rank, and your OP.GG link so franchises can scout your stats and performance.
        </p>
        <h3 className={subsectionHeadingClass}>Captain Sign-Ups</h3>
        <p className={paragraphClass}>
          All players who want to participate as a captain in the following split can sign up here
        </p>
        <p className={paragraphClass}>
          <a
            className="text-gold underline decoration-gold/50 underline-offset-4 hover:text-white"
            href="https://forms.gle/MrzDgQ51K7KyEt4q6"
            rel="noopener noreferrer"
            target="_blank"
          >
            https://forms.gle/MrzDgQ51K7KyEt4q6
          </a>
        </p>
        <p className={paragraphClass}>
          Captains are players who are in charge of running their teams franchise slot for the duration of the split
        </p>
        <p className={paragraphClass}>
          Captains are responsible for signing a free agent, auction drafting, and managing their roster (e-sub, replacements, trades).
        </p>
        <p className={paragraphClass}>
          Captains also have a separate entry fee and prize pool covered in section 1.5
        </p>
        <h3 className={subsectionHeadingClass}>The Draft</h3>
        <p className={paragraphClass}>
          Instead of teams recruiting privately, FPL uses a draft system.
        </p>
        <p className={paragraphClass}>Here’s how the draft works:</p>
        <ul className={listClass}>
          <li>Captains take turns selecting players (By Bidding From Their 100pt Allotment), one at a time, from the player pool.</li>
          <li>The draft goes in rounds until each team fills all 5 roles (Top, Jungle, Mid, ADC, Support).</li>
          <li>This means everyone has a chance to be picked, and strong players are spread across teams rather than stacked on one roster.</li>
          <li>It creates balanced, competitive teams and makes the league exciting for everyone!</li>
        </ul>
        <h3 className={subsectionHeadingClass}>Building Rosters</h3>
        <p className={paragraphClass}>After the draft, each Captain has its own roster.</p>
        <p className={paragraphClass}>Those players officially become part of that team for the season.</p>
        <p className={paragraphClass}>Captains might run scrims (practice matches), help with coaching, and build team synergy.</p>
        <h3 className={subsectionHeadingClass}>The Competition</h3>
        <p className={paragraphClass}>Once teams are set, the season begins!</p>
        <p className={paragraphClass}>Teams play scheduled matches against each other.</p>
        <p className={paragraphClass}>Wins and losses affect standings and determine who makes the playoffs and competes for the championship.</p>
      </section>

      <p className={paragraphClass}>
        This rulebook establishes the structure, rules, and guidelines for the Franchise Premier League (FPL) League of Legends competition. Participation constitutes acceptance of all regulations detailed herein.
      </p>
      <p className={paragraphClass}>
        League staff retain authority to enforce rules, interpret the rulebook, and ensure fair play and integrity.
      </p>

      <section aria-labelledby="league-structure" className="space-y-5">
        <h2 id="league-structure" className={sectionHeadingClass}>1. League Structure</h2>
        <h3 className={subsectionHeadingClass}>1.1 Schedule</h3>
        <p className={paragraphClass}>Matches occur weekly on Mondays at 8:00 PM EST.</p>
        <h3 className={subsectionHeadingClass}>1.2 Teams</h3>
        <p className={paragraphClass}>Each team comprises five players (Top, Jungle, Mid, ADC, Support).</p>
        <h3 className={subsectionHeadingClass}>1.3 Divisions</h3>
        <p className={paragraphClass}>Teams will be competing in two divisions during the regular season: Solari and Lunari</p>
        <p className={paragraphClass}>Placement into divisions is determined by Nemesis Draft</p>
        <h3 className={subsectionHeadingClass}>1.4 Player Eligibility</h3>
        <p className={paragraphClass}>
          Every Split player must adhere to the following player eligibility requirements. If a player is affected by any of the below restrictions after completing a split, then they will have their eligibility reassessed solely for the purpose of determining compliance with the eligibility thresholds in effect for the subsequent split. Once accepted and paid for their spot for the current split, players can climb without changes/restrictions, but will have to adhere to the below policies upon attempting to re-enter future splits.
        </p>
        <ul className={listClass}>
          <li>Required Games Played - Required 150 Games combined both in S2025 and S2026.</li>
          <li>Elo Sitting Games: Require players to play five games every 14 days</li>
          <li>Account Level Requirement: Level 200. (Exceptions can be made in a ticket.)</li>
          <li>Disclosure of Alternate Accounts: At registration, players are required to disclose all accounts they have that are level 30 or higher. Players are also required to submit any newly-acquired accounts during the season or any accounts that reach level 30 during the season.</li>
          <li>Season 15 Peak Rank – A player must not have peaked above Diamond 1 99 LP at any time within LoL Season 15. See Solo-queue warrior clause for more details.</li>
        </ul>
        <p className={paragraphClass}>Solo-queue Warrior Clause for Previous Masters:</p>
        <p className={paragraphClass}>
          Former Masters Players who have played at least 200 games since achieving their previous peak rank may submit a request to be eligible to play. This request must be submitted via a support ticket and will be reviewed by the Founders.
        </p>
        <h3 className={subsectionHeadingClass}>1.5 Captain Entry Fees &amp; Prizes (12 Team)</h3>
        <p className={paragraphClass}>This split has a $25 entry fee per captain.</p>
        <ul className={listClass}>
          <li>1st Place $200</li>
          <li>2nd Place $100</li>
        </ul>
        <h3 className={subsectionHeadingClass}>1.6 Player Entry Fees &amp; Prizes (12 Team)</h3>
        <p className={paragraphClass}>Players have a $15 entry fee.</p>
        <p className={paragraphClass}>1st $260       2nd $140</p>
        <h3 className={subsectionHeadingClass}>1.7 Operation Costs (Content, Stream, Staff, etc.)</h3>
        <p className={paragraphClass}>$320 of Player Entry</p>
      </section>

      <section aria-labelledby="auction-draft-format" className="space-y-5">
        <h2 id="auction-draft-format" className={sectionHeadingClass}>2. Auction Draft Format</h2>
        <h3 className={subsectionHeadingClass}>2.1 Auction Draft Format</h3>
        <p className={paragraphClass}>The Auction Draft will be conducted by an auctioneer, with each Captain taking turns nominating one player per round.</p>
        <p className={paragraphClass}>Each Captain begins the Auction Draft with a total of one hundred (100) auction points. (Minus any points used in offseason or on captain.)</p>
        <p className={paragraphClass}>During the 1st round, a franchise nominates a player; they must immediately place a minimum opening bid of 10 points on that player.</p>
        <p className={paragraphClass}>During the 2nd round, a franchise nominates a player; they must immediately place a minimum opening bid of 5 points on that player. (After the 2nd round minimum bids can start at 1 point)</p>
        <p className={paragraphClass}>Bids must increase in increments of at least one (1) point.</p>
        <p className={paragraphClass}>If no other bids are placed, the nominating captain automatically acquires the player at the minimum bid.</p>
        <h3 className={subsectionHeadingClass}>2.2 Auction Etiquette and Interference:</h3>
        <p className={paragraphClass}>The auctioneer will call bids using the format “Going once, going twice, sold.”</p>
        <p className={paragraphClass}>Captains may not:</p>
        <ul className={listClass}>
          <li>Nominate players for roles they have already filled on their roster.</li>
          <li>Bid on players who occupy roles already filled on their roster.</li>
          <li>Intentionally Delay/Stall</li>
        </ul>
        <p className={paragraphClass}>If you cause auction interference listed above you may receive the following punishment</p>
        <p className={paragraphClass}>Warning → 2-point deduction → 5-point deduction → skipped nomination round.</p>
        <h3 className={subsectionHeadingClass}>2.3 Nemesis Division Draft</h3>
        <p className={paragraphClass}>Immediately following the auction draft, Captains will be participating in a Nemesis Draft to assign Teams to their Divisions for the upcoming split.</p>
        <p className={paragraphClass}>The first Team will be selected to Division Solari by spinning a wheel.</p>
        <p className={paragraphClass}>The Captain selected by the wheel will be given the ability to select what Team will be drafted to the Lunari Division. These steps are repeated until both divisions are filled.</p>
      </section>

      <section aria-labelledby="regular-season-structure" className="space-y-5">
        <h2 id="regular-season-structure" className={sectionHeadingClass}>3. Regular Season Structure (12 Team)</h2>
        <h3 className={subsectionHeadingClass}>3.1 Format</h3>
        <p className={paragraphClass}>The Regular Season will span 5 weeks.</p>
        <p className={paragraphClass}>The league will be divided into two groups, each containing either 6 Teams.</p>
        <p className={paragraphClass}>Every week each group will play one best-of-three (BO3) round-robin format.</p>
        <p className={paragraphClass}>All matches will be scheduled for Mondays at 8:00 PM EST, unless rescheduled in compliance with league rescheduling policies.</p>
        <p className={paragraphClass}>League Reschedule Policy found in section 7.6</p>
        <h3 className={subsectionHeadingClass}>3.2 Advancement to Postseason (12 Team)</h3>
        <p className={paragraphClass}>The top 3 teams from each group, based on standings, will advance directly to the Playoffs.</p>
        <p className={paragraphClass}>The bottom 3 teams from each group will enter the Gauntlet, a last-chance playoff structure offering a path to the postseason for lower-seeded teams.</p>
        <h3 className={subsectionHeadingClass}>3.3 Standings and Tiebreakers</h3>
        <p className={paragraphClass}>Regular Season standings will be determined by the following criteria, in order of priority:</p>
        <ol className={orderedListClass}>
          <li>Series Record</li>
          <li>Total number of BO3 series won and lost.</li>
          <li>Individual Game Record</li>
          <li>Overall Individual Game Win %</li>
          <li>Head-to-Head Record</li>
          <li>Series results between tied teams.</li>
          <li>Average Win Game Length</li>
          <li>Used as a final tiebreaker if all previous metrics are equal.</li>
        </ol>
        <p className={paragraphClass}>Any necessary tiebreaker matches will be determined and scheduled at the discretion of League Staff.</p>
      </section>

      <section aria-labelledby="playoff-season-structure" className="space-y-5">
        <h2 id="playoff-season-structure" className={sectionHeadingClass}>4. Playoff Season Structure</h2>
        <h3 className={subsectionHeadingClass}>4.1 Gauntlet Stage</h3>
        <p className={paragraphClass}>Following the regular season, the bottom teams from each group will enter the Gauntlet Stage for a chance to qualify for the playoffs.</p>
        <p className={paragraphClass}>Higher seed receives side selection.</p>
        <p className={paragraphClass}>The Gauntlet consists of:</p>
        <ul className={listClass}><li>Two Best-of-One (BO1) matches</li><li>Winners advance to the Playoff Bracket.</li></ul>
        <p className={paragraphClass}>Gauntlet seeding rules:</p>
        <ul className={listClass}>
          <li>Lower seeds initially play cross-group lower seeds whenever possible.</li>
          <li>Example:</li>
          <li>Solari #6 vs Lunari #5</li>
          <li>Solari #5 vs Lunari #6</li>
          <li>4th seeds receive byes in the first round.</li>
        </ul>
        <p className={paragraphClass}>If 3 second round gauntlet teams come from the same group, the lowest remaining seed from that group will be matched against the highest seed from the same group:</p>
        <p className={paragraphClass}>Example:</p>
        <ul className={listClass}>
          <li>Round 1: Solari #6 vs Lunari #5 → Solari#6 wins</li>
          <li>Round 1: Solari #5 vs Lunari #6 → Solari#5 wins</li>
          <li>Round 2: Solari #4 vs Solari #6</li>
          <li>Round 2: Solari #5 vs Lunari #4</li>
        </ul>
        <p className={paragraphClass}>Gauntlet example 1:</p>
        <p className={paragraphClass}>This diagram shows how the FPL Gauntlet stage works when advancing teams come from mixed groups.</p>
        <p className={paragraphClass}>In Round 1, Solari #5 defeats Lunari #6, while Lunari #5 defeats Solari #6.</p>
        <p className={paragraphClass}>In Round 2, the winners from Round 1 face the 4th seeds from each group.</p>
        <p className={paragraphClass}>Solari #4 plays Lunari #5.</p>
        <p className={paragraphClass}>Lunari #4 plays Solari #5.</p>
        <p className={paragraphClass}>Winners of Round 2 advance into the main Playoff bracket. This structure helps maintain cross-group matchups wherever possible and gives lower-seeded teams a path to playoffs.</p>
        <p className={paragraphClass}>Gauntlet example 2:</p>
        <p className={paragraphClass}>This diagram shows how the FPL Gauntlet stage works when two teams from the same Solari advance.</p>
        <p className={paragraphClass}>In Round 1, Solari #5 defeats Lunari #6, and Solari #6 defeats Lunari #5.</p>
        <p className={paragraphClass}>In Round 2, the winners face higher seeds from their own group due to the same-group constraint:</p>
        <p className={paragraphClass}>Solari #4 plays Solari #6.</p>
        <p className={paragraphClass}>Lunari #4 plays Solari #5.</p>
        <p className={paragraphClass}>This ensures cross-group matchups remain prioritized when possible but handles situations where multiple teams advance from the same group.</p>
        <h3 className={subsectionHeadingClass}>4.2 Playoff Structure</h3>
        <p className={paragraphClass}>All playoffs will be BO5.</p>
        <p className={paragraphClass}>Side selection will be determined by the higher seed.</p>
        <p className={paragraphClass}>Then will be determined by the loser.</p>
        <h3 className={subsectionHeadingClass}>4.2.1 Cross-Group Enforcement</h3>
        <p className={paragraphClass}>The Playoff Bracket is structured to enforce cross-group matchups whenever possible in the opening playoff round. This ensures diverse competition and minimizes same-group rematches too early in the bracket.</p>
        <p className={paragraphClass}>Cross-Group Priority:</p>
        <p className={paragraphClass}>The first seeds (A1 and B1) will be matched, where possible, against the lowest available seeds from the opposite group (including any gauntlet winners).</p>
        <p className={paragraphClass}>Second and third seeds from each group will also be paired cross-group where feasible.</p>
        <p className={paragraphClass}>Same-Group Pairings Exception:</p>
        <p className={paragraphClass}>Same-group matchups in the first playoff round are allowed only if:</p>
        <ul className={listClass}>
          <li>There are not enough teams from the opposite group to avoid them, or</li>
          <li>Bracket integrity requires avoiding repeated matchups deeper in the playoffs.</li>
        </ul>
        <h4 className={minorHeadingClass}>Example 1 – Gauntlet Winners from the Same Group</h4>
        <p className={paragraphClass}>If both gauntlet winners are from Solari (e.g. Solari #5 and Solari #4), the playoff seeds are:</p>
        <ul className={listClass}>
          <li>Solari #1, Solari #2, Solari #3</li>
          <li>Lunari #1, Lunari #2, Lunari #3</li>
          <li>Solari #4, Solari #5</li>
        </ul>
        <p className={paragraphClass}>Opening matchups might be arranged to force cross-group play:</p>
        <ul className={listClass}>
          <li>Solari #1 vs Solari #5</li>
          <li>Lunari #1 vs Solari #4</li>
          <li>Solari #2 vs Lunari #3</li>
          <li>Lunari #2 vs Solari #3</li>
        </ul>
        <p className={paragraphClass}>Only Solari #1 vs Solari #5 remains a same-group matchup, unavoidable because both teams are from Solari.</p>
        <h4 className={minorHeadingClass}>Example 2 – One Gauntlet Winner from Each Group</h4>
        <p className={paragraphClass}>If gauntlet winners are Solari #5 and Lunari #5, playoff seeds are:</p>
        <ul className={listClass}>
          <li>Solari #1, Solari #2, Solari #3</li>
          <li>Lunari #1, Lunari #2, Lunari #3</li>
          <li>Solari #5, Lunari #5</li>
        </ul>
        <p className={paragraphClass}>Round 1 matchups might be:</p>
        <ul className={listClass}>
          <li>Solari #1 vs Lunari #5</li>
          <li>Lunari #1 vs Solari #5</li>
          <li>Solari #2 vs Lunari #3</li>
          <li>Lunari #2 vs Solari #3</li>
        </ul>
        <p className={paragraphClass}>This fully enforces cross-group matchups in the first round.</p>
        <h4 className={minorHeadingClass}>Example 3 – Unequal Group Representation in Semi-Finals</h4>
        <p className={paragraphClass}>This example demonstrates a playoff scenario where the semifinal stage has an unequal group distribution: one team from Solari (A#1) and three teams from Lunari (B#1, B#2, B#3) have advanced.</p>
        <p className={paragraphClass}>To preserve cross-group matchups as much as possible, the lone Solari team (A#1) is matched against the Lunari #2  seeds from Lunari. The highest remaining seed from Lunari (B#1) faces the lowest remaining seed from their same group.</p>
        <p className={paragraphClass}>Semifinal 1: Solari #1 vs Lunari #2</p>
        <p className={paragraphClass}>Semifinal 2: Lunari #1 vs Lunari #3</p>
        <p className={paragraphClass}>This pairing minimizes same-group matches until unavoidable and ensures the top-seeded A#1 does not receive a bye or an unfair advantage. The winners of these matches advance to the Grand Finals.</p>
      </section>

      <section aria-labelledby="relegation" className="space-y-5">
        <h2 id="relegation" className={sectionHeadingClass}>5. Relegation</h2>
        <p className={paragraphClass}>Captains that finish 11th and 12th place (Teams that lose the first round of gauntlet) will be relegated from being captains for the following split.</p>
        <p className={paragraphClass}>They can re-apply with a one split cooldown period. (They can still play as a returning player)</p>
        <p className={paragraphClass}>Relegation is automatic unless league staff determine that extraordinary circumstances materially affected competitive participation.</p>
      </section>

      <section aria-labelledby="team-management" className="space-y-5">
        <h2 id="team-management" className={sectionHeadingClass}>6. Team Management</h2>
        <h3 className={subsectionHeadingClass}>6.1 Trades</h3>
        <p className={paragraphClass}>Trade Window:</p>
        <p className={paragraphClass}>Trading is permitted directly after draft till the sunday before week 5’s match.</p>
        <p className={paragraphClass}>Approval Process:</p>
        <p className={paragraphClass}>Trades must pass the FPL Checks and Balances system, requiring a majority vote (at least 2 of 3 votes) from:</p>
        <ul className={listClass}>
          <li>Head Admin</li>
          <li>Player Representatives</li>
          <li>Captains</li>
        </ul>
        <p className={paragraphClass}>Example: Captains and Player Representatives vote yes, Head Admin votes no → trade passes.</p>
        <h3 className={subsectionHeadingClass}>6.2 Substitutes and E-Subs</h3>
        <p className={paragraphClass}>Two substitutes per week max (Anymore refer to 6.3); no penalty if approved 24 hours prior.</p>
        <p className={paragraphClass}>Emergency substitutes incur penalties: 1 ban loss per late sub.</p>
        <p className={paragraphClass}>Admins will have discretion on e-subs that are submitted even when technically adhering to the items listed below:</p>
        <p className={paragraphClass}>A substitute’s current rank must be equal to or lower than the replaced player’s Current Rank in S2026.</p>
        <p className={paragraphClass}>Additionally, a substitute may not have peaked a whole division higher than the player they are replacing. (ex. E2 Replaced by D4)</p>
        <p className={paragraphClass}>The current season, or the immediately preceding season of 15.</p>
        <p className={paragraphClass}>League administrators reserve the right to submit any substitute approval to a vote when necessary to preserve league integrity. If a substitute is proposed with fewer than twelve (12) hours’ notice before game day, administrators may deny the request if it could reasonably compromise competitive integrity.</p>
        <p className={paragraphClass}>Examples include, but are not limited to, replacing an off-role player with an on-role player of significantly higher skill or using a known Elo sitter. Administrators also reserve the right to order a remake of any match/restrict usage of the individual in future series in which a substitute’s performance materially compromises competitive integrity.</p>
        <p className={paragraphClass}>Players must pass all additional eligibility checks listed in Section 1.3, Player Eligibility.</p>
        <h3 className={subsectionHeadingClass}>6.3 Three E-Subs</h3>
        <p className={paragraphClass}>In the event that 3 E-Subs are needed the following punishments will be applied regardless of notice:</p>
        <ul className={listClass}><li>1 Game Loss for Bo3 or 2 Game Loss for Bo5</li><li>Lose first phase bans in all games with more than 2 E-Subs</li></ul>
        <h3 className={subsectionHeadingClass}>6.4 Mid-Series E-Subs</h3>
        <p className={paragraphClass}>Teams that require an E-SUB mid series will have 15 minutes after the previous game finishes to find an E-SUB.</p>
        <p className={paragraphClass}>In the event that a team needs an E-SUB mid series, here are the punishments per game sub is needed:</p>
        <p className={paragraphClass}>In B03s: Team with incoming sub loses all first phase bans in game 2 or 3 of B03s.</p>
        <p className={paragraphClass}>In B05s:</p>
        <p className={paragraphClass}>NOTE: ALL B05 SERIES THAT NEED A MID SERIES SUB ARE ENCOURAGED TO BE RESCHEDULED.</p>
        <ul className={listClass}>
          <li>Join Game 2: Team loses an additional ban on top of the E-Sub ban. (2 bans total).</li>
          <li>Join Game 3: Gaining Team loses all bans.</li>
          <li>Join Game 4: Team FFs 1 game or series.</li>
          <li>Esubs can not join for game 5.</li>
        </ul>
        <p className={paragraphClass}>If a team is seen hiding their starting player to play an Esub mid series, that team will be punished by either losing a game or the entire series.</p>
        <h3 className={subsectionHeadingClass}>6.5 Role Swaps</h3>
        <p className={paragraphClass}>Players are locked into the role assigned at the start of each season.</p>
        <p className={paragraphClass}>You must attend your lane assignment until 3 minutes into the game.</p>
        <p className={paragraphClass}>Admin discretion can decide any abuse to this rule. Submit a ticket and pause the game if you believe someone is breaking 6.4.</p>
        <p className={paragraphClass}>Players are required to take the quest that is associated with their assigned role in the league.</p>
        <h3 className={subsectionHeadingClass}>6.6 Game Pauses</h3>
        <p className={paragraphClass}>Teams are permitted to pause a match if unexpected technical issues or personal emergencies occur.</p>
        <h4 className={minorHeadingClass}>Pause Limits</h4>
        <p className={paragraphClass}>Each team is allowed up to ten (10) minutes of pause time per game, whether the match is being streamed or not. Once a team reaches this limit, they must resume the game regardless of the situation.</p>
        <p className={paragraphClass}>An additional ten (10) minutes may be used solely by league officials to resolve in-game rulings or administrative decisions.</p>
        <h4 className={minorHeadingClass}>Acceptable Pause Reasons</h4>
        <p className={paragraphClass}>Pauses should only occur for legitimate situations. Acceptable reasons include technical problems or sudden, unavoidable life circumstances.</p>
        <p className={paragraphClass}>League staff reserves the right to request a match be unpaused if they determine the reason is insufficient. For example, pausing a game right before it ends will typically be denied.</p>
        <h4 className={minorHeadingClass}>No Pausing During Combat</h4>
        <p className={paragraphClass}>Teams are not allowed to pause while players are actively engaging one another. Combat is defined as any moment when a player casts abilities or attacks an opponent, or responds to an enemy action with a spell or ability.</p>
        <h3 className={subsectionHeadingClass}>6.7 Player Replacements</h3>
        <p className={paragraphClass}>Permanent replacements follow substitute eligibility rules.</p>
        <p className={paragraphClass}>Staff maintains the right to declare controversial replacements as a vote.</p>
        <p className={paragraphClass}>Players are required to be replaced and approved no later than one week after player removal.</p>
        <p className={paragraphClass}>Replacement Players can be put up for a vote if deemed necessary.</p>
        <h3 className={subsectionHeadingClass}>6.8 Rescheduling Policy</h3>
        <p className={paragraphClass}>All regular season matches are scheduled for Mondays each week.</p>
        <p className={paragraphClass}>Teams may reschedule a match if:</p>
        <ul className={listClass}>
          <li>The match can be rescheduled to any time within 2 weeks of the scheduled match day</li>
          <li>Both teams agree on the new time.</li>
        </ul>
        <p className={paragraphClass}>For playoff matches the game must be scheduled before next week’s match.</p>
        <p className={paragraphClass}>When both teams agree to a rescheduled time, the rules outlined in Game Punctuality 7.2 apply.</p>
      </section>

      <section aria-labelledby="match-setup" className="space-y-5">
        <h2 id="match-setup" className={sectionHeadingClass}>7. Match Setup &amp; Procedure</h2>
        <h3 className={subsectionHeadingClass}>7.1 Lobby &amp; Side Selection</h3>
        <p className={paragraphClass}>Matches created via Tournament Codes are provided weekly.</p>
        <p className={paragraphClass}>Initial sides are predetermined; the previous game's losing team chooses subsequent sides.</p>
        <p className={paragraphClass}>During custom lobby set up you must have the appropriate quest assigned to the appropriate role (Ex. you can't have 2 top lane quests assigned to your team)</p>
        <h3 className={subsectionHeadingClass}>7.2 Game Punctuality</h3>
        <ul className={listClass}>
          <li>10 mins late: 1 ban loss.</li>
          <li>15 mins late: 3 ban losses.</li>
          <li>20 mins late: Game forfeit.</li>
          <li>30 minutes late: Series forfeit</li>
        </ul>
        <h3 className={subsectionHeadingClass}>7.3 Time Between Games</h3>
        <p className={paragraphClass}>Teams have 5 minutes between games to be lined up in lobby</p>
        <p className={paragraphClass}>Staff after this point can be contacted to start tracking time and following penalties can be enforced:</p>
        <ul className={listClass}>
          <li>5 Mins past is 2 Bans Lost</li>
          <li>10 Mins past is ALL Bans Lost</li>
          <li>15 Mins past is next Game FORFEIT</li>
          <li>20 Mins past is series FORFEIT</li>
        </ul>
        <h3 className={subsectionHeadingClass}>7.4 Champion Draft</h3>
        <p className={paragraphClass}>Third-party drafting tools mandatory (DraftLoL or Drafter).</p>
        <p className={paragraphClass}>Players must maintain client draft positions; limited lane swaps permitted in-game.</p>
        <h3 className={subsectionHeadingClass}>7.5 Fearless Format</h3>
        <p className={paragraphClass}>In a Full Fearless Draft, champions that a team picks may not be used again in the duration of that series. For example, if Team A selects Aatrox, Sejuani, Orianna, Xayah, and Rakan in their pick ban of Game 1 of the Bo3, and Team B selects Ornn, Kayn, Ahri, Vayne, and Lux, both Team A and Team B will not be able to use any of those champions for the remainder of the series, regardless of win or loss of each game.</p>
        <p className={paragraphClass}>For a playoff Bo5 series, the match will be full fearless (with complete bans in Games 4 and 5).</p>
      </section>

      <section aria-labelledby="player-conduct" className="space-y-5">
        <h2 id="player-conduct" className={sectionHeadingClass}>8. Player Conduct</h2>
        <p className={paragraphClass}>All participants in the Franchise Premier League (FPL) are held to the highest standards of competitive integrity and personal conduct. By participating in the FPL, players and associated staff agree to uphold the following:</p>
        <p className={paragraphClass}>Suppose any participant feels uncomfortable, unsafe, or believes a line has been crossed in any communication (including private messages, in-game chat, Discord, or social media). In that case, they are strongly encouraged to report this immediately by opening a ticket. The staff will investigate and escalate concerns as necessary, and all reports will be handled with discretion And confidentiality.</p>
        <h3 className={subsectionHeadingClass}>8.1 Fair Play and Integrity</h3>
        <p className={paragraphClass}>All players are required to compete to the best of their ability in every match.</p>
        <p className={paragraphClass}>The following actions are strictly prohibited and constitute serious violations of league rules:</p>
        <ul className={listClass}>
          <li>Collusion: Any agreement between players or teams to intentionally influence the outcome of a game or match for personal or team gain.</li>
          <li>Hacking or Cheating: The use of unauthorized software, scripts, or external devices to modify or gain unfair advantages in-game.</li>
          <li>Exploiting Bugs: Intentionally using game bugs or unintended mechanics to secure advantages.</li>
          <li>Smurfing: Playing under another player’s account or knowingly allowing someone else to play on one’s account.</li>
          <li>Match-Fixing: Deliberately losing or manipulating match outcomes for financial or competitive advantage.</li>
          <li>Stream Sniping: Viewing an opponent’s live stream during a match to obtain real-time information.</li>
        </ul>
        <h3 className={subsectionHeadingClass}>8.2 Unprofessional Conduct</h3>
        <p className={paragraphClass}>The following behaviors are prohibited: In All Channels</p>
        <p className={paragraphClass}>Harassment: Persistent or severe actions intended to disturb, threaten, or demean individuals or groups, including but not limited to:</p>
        <ul className={listClass}>
          <li>Insults, slurs, or offensive remarks related to race, ethnicity, nationality, gender, sexual orientation, religion, or disability.</li>
          <li>Targeted personal attacks or doxxing.</li>
        </ul>
        <p className={paragraphClass}>Abusive Behavior: Excessive flaming, toxic language, or threats directed at opponents, teammates, staff, or community members.</p>
        <p className={paragraphClass}>Disruptive to the League: Actions that harm the reputation or integrity of the FPL, including:</p>
        <ul className={listClass}><li>Posting inappropriate or offensive content associated with the FPL brand.</li><li>Player removal from the league</li></ul>
        <p className={paragraphClass}>Players can be removed from the league under strenuous circumstances that involve behavioral issues, attendance issues, etc.</p>
        <h3 className={subsectionHeadingClass}>8.3 Communication Guidelines</h3>
        <p className={paragraphClass}>Players must use appropriate language in all official league communications, including:</p>
        <ul className={listClass}>
          <li>In-game chat</li>
          <li>Voice comms</li>
          <li>Discord servers</li>
          <li>Public social media when discussing league matters</li>
        </ul>
        <p className={paragraphClass}>Excessive profanity or inflammatory language in official settings is discouraged and may result in warnings or penalties.</p>
        <p className={paragraphClass}>Suppose any participant feels uncomfortable, unsafe, or believes a line has been crossed in any communication (including private messages, in-game chat, Discord, or social media). In that case, they are strongly encouraged to report this immediately by opening a ticket. The staff will investigate and escalate concerns as necessary, and all reports will be handled with discretion and confidentiality.</p>
        <h3 className={subsectionHeadingClass}>8.4 Banter Chat</h3>
        <p className={paragraphClass}>The FPL maintains dedicated “banter chat” channels for playful trash talk, memes, and competitive banter among participants.</p>
        <p className={paragraphClass}>Participation in banter chats is entirely optional.</p>
        <p className={paragraphClass}>Banter chat channels are moderated less rigorously than other official channels, allowing for competitive banter. However:</p>
        <ul className={listClass}>
          <li>Hate speech and personal threats remain strictly prohibited.</li>
          <li>The line between acceptable banter and personal attacks is determined at the discretion of the staff.</li>
          <li>Participants are encouraged to self-regulate and maintain mutual respect, even in banter contexts.</li>
          <li>Players who prefer not to engage in banter chats may mute or leave these channels.</li>
        </ul>
        <p className={paragraphClass}>If any participant feels uncomfortable, unsafe, or believes a line has been crossed in any communication (including private messages, in-game chat, Discord, or social media). In that case, they are strongly encouraged to report this immediately by opening a ticket. The staff will investigate and escalate concerns as necessary, and all reports will be handled with discretion and confidentiality.</p>
        <h3 className={subsectionHeadingClass}>8.5 Penalties and Enforcement</h3>
        <p className={paragraphClass}>Violations of this section may result in disciplinary actions, including but not limited to:</p>
        <ul className={listClass}>
          <li>Warnings</li>
          <li>Loss of bans in future drafts</li>
          <li>Suspension from one or more matches</li>
          <li>Permanent ban from the league</li>
          <li>Forfeiture of prize money or standing in the current season</li>
        </ul>
        <p className={paragraphClass}>The severity of penalties will be determined by the staff based on:</p>
        <ul className={listClass}>
          <li>Nature and seriousness of the offense</li>
          <li>Impact on competitive integrity</li>
          <li>Prior disciplinary history</li>
        </ul>
        <p className={paragraphClass}>All decisions regarding conduct violations are final and binding.</p>
      </section>

      <section aria-labelledby="content-streaming" className="space-y-5">
        <h2 id="content-streaming" className={sectionHeadingClass}>9. Content and Streaming</h2>
        <ul className={listClass}>
          <li>Official matches may be streamed by the league or independently.</li>
          <li>Results must not be disclosed prematurely.</li>
          <li>Stream sniping prohibited; recommended stream delay: 3 minutes.</li>
        </ul>
      </section>

      <section aria-labelledby="rule-amendments" className="space-y-5">
        <h2 id="rule-amendments" className={sectionHeadingClass}>10. Rule Amendments</h2>
        <p className={paragraphClass}>The Franchise Premier League (FPL) reserves the right to update, modify, or clarify any rules contained in this rulebook at any time to preserve competitive integrity and ensure fair play.</p>
        <p className={paragraphClass}>All rule changes will be:</p>
        <ul className={listClass}>
          <li>Documented in a public changelog.</li>
          <li>Announced promptly via official league communication channels (e.g., Discord, website, email).</li>
        </ul>
        <p className={paragraphClass}>Amendments will not retroactively affect matches that have already been completed before the effective date of the change, except in extraordinary circumstances where failing to do so would compromise competitive integrity.</p>
        <p className={paragraphClass}>In situations where retroactive enforcement is deemed necessary, such decisions will require a majority vote from the staff.</p>
        <p className={paragraphClass}>Participants are responsible for staying informed about rule changes once they are announced.</p>
      </section>

      <section aria-labelledby="lock-in-window" className="space-y-5">
        <h2 id="lock-in-window" className={sectionHeadingClass}>11. The Lock-In Window (Offseason)</h2>
        <p className={paragraphClass}>3-day Lock-In Window.</p>
        <h3 className={subsectionHeadingClass}>Phase 1 - Market Value Period (24 Hours)</h3>
        <p className={paragraphClass}>All players going into the split’s auction draft will have a pre-established market minimum.</p>
        <p className={paragraphClass}>Each Captain has 12 bids they can make on players during the Market Value Period. These bids will be used at a silent auction.</p>
        <p className={paragraphClass}>The 12 bids will be from only these values. These bids are arbitrary and will not be taken away from your team’s cap. They are only meant to set a player's value for Free Agency.</p>
        <ul className={listClass}>
          <li>2- 50 pt bid.</li>
          <li>3- 40 pt bid.</li>
          <li>2- 30 pt bid</li>
          <li>2- 20 pt bid.</li>
          <li>2- 10 pt bid.</li>
          <li>1- 5 pt bid.</li>
        </ul>
        <p className={paragraphClass}>Captains can only use one unique bid per player. All bids MUST be used. Captains may not bid on players in their own role.</p>
        <p className={paragraphClass}>At the end of the Market Value Period, the average value a player was bid on (including their sit price) will set their free agency price.</p>
        <p className={paragraphClass}>If a captain did not bid on a certain player during Market Value Period then they are not able to sign them during Selective Free Agency.</p>
        <p className={paragraphClass}>Players or Captains caught trying to manipulate/collude during Phase 1 can be given punishments if caught by the Admin team:</p>
        <p className={paragraphClass}>For purposes of this section, ‘collusion’ means a pre-arranged agreement between two or more captains or players intended to artificially inflate or suppress a player’s market value.</p>
        <p className={paragraphClass}>A finding of collusion requires clear and articulable evidence, not mere similarity of bids.</p>
        <p className={paragraphClass}>Punishment Examples. - Point Deductions from total allotment, Point Addition to player cost, Removal from league.</p>
        <h3 className={subsectionHeadingClass}>Phase 2 – Selective Free Agency (48 Hours)</h3>
        <p className={paragraphClass}>Each Captain is only able to sign one player (that they bid on) during the Selective Free Agency.</p>
        <p className={paragraphClass}>A Player can only be signed for the price set by Market Value Period.</p>
        <p className={paragraphClass}>Even if a Captain bid on a player during the Market Value Period they do not have to make an offer to those players.</p>
        <p className={paragraphClass}>As Captains send offers to players, the players will make the final decision on which captain they would like to play with in the coming season. Captains can open up a ticket to ensure a player responds in a timely manner. (Players are expected to be responsive and help facilitate a smooth Phase 2.)</p>
        <p className={paragraphClass}>In order to confirm a free agent signing, the captain must make a ticket with the player they wish to sign.</p>
        <h3 className={subsectionHeadingClass}>Phase 3 – CONTINGENCY PERIOD (24 Hours)</h3>
        <p className={paragraphClass}>If captains come out of selective free agency without a player signed, the remaining captains will have an additional 24 hours to make offers from the remaining people they bid on during the Market Value Period.</p>
        <h4 className={minorHeadingClass}>Additional Rules</h4>
        <p className={paragraphClass}>Free Agent Signing Restrictions:</p>
        <p className={paragraphClass}>Teams may not circumvent the above limitations through trade agreements or informal arrangements. Violations will result in severe penalties.</p>
        <p className={paragraphClass}>All roster slots beyond those filled by players retained through the Free Agency must be filled via the Auction Draft.</p>
        <h3 className={subsectionHeadingClass}>Phase 4 – Auction Draft (see Section 2 for details)</h3>
        <h3 className={subsectionHeadingClass}>Post-Auction Roster Finalization</h3>
        <p className={paragraphClass}>Once the Auction Draft concludes, rosters are locked for the duration of the upcoming split, except for emergency substitutions under league rules.</p>
        <p className={paragraphClass}>Any disputes or questions regarding draft outcomes will be reviewed by the Admin Team, whose decisions are final and binding.</p>
      </section>

      <section aria-labelledby="admin-discretion" className="space-y-5">
        <h2 id="admin-discretion" className={sectionHeadingClass}>12. Admin Discretion</h2>
        <p className={paragraphClass}>Administrators classified as the Commissioner as well as any Head of Staff members are able to make executive decisions and overrule votes which are deemed to be in the best interest of the league as a whole.</p>
        <h3 className={subsectionHeadingClass}>12.1 Limitations on Admin Diescretion</h3>
        <h4 className={minorHeadingClass}>12.1.1 Impartial Votes from the Staff</h4>
        <p className={paragraphClass}>When a decision needs to be made that other members of the staff may not be able to vote impartially leading to votes being skewed.</p>
        <h4 className={minorHeadingClass}>12.1.2 The Leagues Best Interest or Betterment of the League</h4>
        <p className={paragraphClass}>When someone believes that by enforcing something in a particular way will better the league as a whole. The decision must be made with evidence or multiple suspicions leading to a belief that something is more probable than not.</p>
        <h4 className={minorHeadingClass}>12.1.3 Executive Decisions Need to be Made</h4>
        <p className={paragraphClass}>When someone believes that an executive decision needs to be made in a timely manner or in such a way that there is not proper time for the staff to meet and determine a ruling.</p>
        <h3 className={subsectionHeadingClass}>12.2 Ruling Properties</h3>
        <h4 className={minorHeadingClass}>12.2.1 Must Be Fully Documented</h4>
        <p className={paragraphClass}>The executive decision must be documented in an informal manner showing the overview of why a decision was made. This does not need all evidence to be displayed but must be made public to other admins if they ask for it.</p>
        <h4 className={minorHeadingClass}>12.2.2 They Create Precedence</h4>
        <p className={paragraphClass}>If an executive decision is created it then sets the precedence for future cases of a similar nature. Before a second executive decision can be made on a similar case, one must ensure that there is not already a decision. If a decision has been made, the new ruling must follow the old ruling unless it can be proved that there is a reason why the precedence should be changed or why it should be treated as a one time exception.</p>
        <h4 className={minorHeadingClass}>12.2.3 They Can be Later Overturned by the staff</h4>
        <p className={paragraphClass}>As the league is run by these bodies they have the power to overturn any executive decision for future cases, however, they are not able to go back into the past and change the existing decision that was made. They have the power to change precedence and make the change for all future cases under the same circumstances but cannot change the past. This is to prevent situations where a decision was made, was overturned later, and massive changes would have happened to the structure of the league. As there was sufficient evidence in the first place, no past changes were made.</p>
        <h4 className={minorHeadingClass}>12.2.4 Admin Discretion Rulings are To Be The Final Form of Defense</h4>
        <p className={paragraphClass}>If a decision can be made in any other way, it should be and instead use the correct and normal patterns for getting a rule implemented.</p>
      </section>

      <section aria-labelledby="staff" className="space-y-5">
        <h2 id="staff" className={sectionHeadingClass}>Franchise Premier League Staff</h2>
        <ul className={listClass}>
          <li>Head of Staff: Rutledge</li>
          <li>Staff: Jake, Repped, NeptuneRises</li>
          <li>Founders: Jaydk, Jake, Repped, Rutledge</li>
        </ul>
        <p className={paragraphClass}>All rules and guidelines are subject to interpretation by League Staff. Staff decisions are final.</p>
      </section>

      <section aria-labelledby="changelog" className="space-y-5">
        <h2 id="changelog" className={sectionHeadingClass}>Changelog:</h2>
        <h3 className={subsectionHeadingClass}>08/18/25</h3>
        <p className={paragraphClass}>Added 7.5 Game Pauses to the rulebook via town hall 1.</p>
        <p className={paragraphClass}>Adjusted player rescheduling rule via vote, going 3-0 for 2 week rescheduling period</p>
        <h3 className={subsectionHeadingClass}>8/21/25</h3>
        <p className={paragraphClass}>Adjusted Elo sitting games from ineligible to losing bans via vote passed 3-0</p>
        <p className={paragraphClass}>Split 2</p>
        <h3 className={subsectionHeadingClass}>10/15/25</h3>
        <p className={paragraphClass}>Adjusted low rank replacement to be an option for managers instead of mandatory. Made the replacement rank be below Gold 1 instead of Plat 4. Low elo replacement rank has also dropped to be can only replace with players who are between Gold 1 and Plat 4.</p>
        <p className={paragraphClass}>Tiebreaker #2 wording has been adjusted to specify team win rate.</p>
        <p className={paragraphClass}>The trade window has opened directly after the draft to the day before week 5 regular season.</p>
        <p className={paragraphClass}>The player replacement rule will no longer follow player eligibility.</p>
        <p className={paragraphClass}>Off role players will be labeled by staff preseason even if you aren't in the d2/d1 policy. Meaning if either your op.gg or previous competitive seasons show that you main a different role than what you are playing currently, you will be labeled off role.</p>
        <p className={paragraphClass}>Off role player replacements can’t be higher than E1, and must be replaced by an on-role player no higher than 3 ranks below the off role player (E1 50LP → E4 50LP)</p>
        <p className={paragraphClass}>Removal of trade block section.</p>
        <h3 className={subsectionHeadingClass}>10/16/25</h3>
        <p className={paragraphClass}>Adjusted off role replacement for lower elo off role players. No replacement lower than P4.</p>
        <h3 className={subsectionHeadingClass}>10/18/25</h3>
        <p className={paragraphClass}>Rule 13 has been made with admin discretion</p>
        <p className={paragraphClass}>Split 3</p>
      </section>
    </article>
  );
}
