import HiddenCoin from "./HiddenCoin";

const sectionHeadingClass =
  "scroll-mt-24 border-b border-line pb-3 font-display text-2xl font-semibold text-white sm:text-3xl";
const subsectionHeadingClass =
  "scroll-mt-24 pt-3 font-display text-xl font-semibold text-white";
const paragraphClass = "max-w-4xl text-steel";
const listClass = "max-w-4xl list-disc space-y-2 pl-6 text-steel";
const orderedListClass = "max-w-4xl list-decimal space-y-2 pl-6 text-steel";

type BracketMatchProps = {
  top: string;
  bottom: string;
};

function BracketMatch({ top, bottom }: BracketMatchProps) {
  return (
    <div className="overflow-hidden rounded border border-line bg-navy/80">
      <div className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-gold">
        {top}
      </div>
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white">
        {bottom}
      </div>
    </div>
  );
}

type BracketColumnProps = {
  title: string;
  matches: BracketMatchProps[];
};

function BracketColumn({ title, matches }: BracketColumnProps) {
  return (
    <div className="space-y-4">
      <h4 className="font-display text-sm font-semibold uppercase tracking-[0.14em] text-steel">
        {title}
      </h4>
      <div className="space-y-4">
        {matches.map((match) => (
          <BracketMatch key={match.top + match.bottom} {...match} />
        ))}
      </div>
    </div>
  );
}

function GauntletPlayoffFigure() {
  return (
    <figure
      aria-labelledby="gauntlet-playoff-caption"
      className="max-w-5xl rounded border border-line bg-panel/70 p-4 sm:p-6"
    >
      <div
        aria-label="Gauntlet and playoff bracket showing quarterfinals, semifinals, and grand finals"
        className="grid gap-6 overflow-x-auto sm:grid-cols-3 sm:gap-8"
        role="img"
      >
        <BracketColumn
          title="Quarterfinals"
          matches={[
            { top: "Solari #1", bottom: "Solari #5" },
            { top: "Lunari #1", bottom: "Solari #4" },
            { top: "Solari #2", bottom: "Lunari #3" },
            { top: "Lunari #2", bottom: "Solari #3" },
          ]}
        />
        <BracketColumn
          title="Semifinals"
          matches={[
            { top: "Solari #1", bottom: "Lunari #2" },
            { top: "Lunari #1", bottom: "Solari #2" },
          ]}
        />
        <BracketColumn
          title="Grand Finals"
          matches={[{ top: "Solari #1", bottom: "Lunari #1" }]}
        />
      </div>
      <figcaption id="gauntlet-playoff-caption" className="mt-5 text-sm text-steel">
        Gauntlet and playoff format and flow.
      </figcaption>
    </figure>
  );
}

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
          Franchise Premier League(FPL)–Official Premier Rulebook Split 5
        </h1>
      </header>

      <section aria-labelledby="league-overview" className="space-y-5">
        <h2 id="league-overview" className={sectionHeadingClass}>
          League Overview
        </h2>

        <h3 className={subsectionHeadingClass}>Welcome Message</h3>
        <p className={paragraphClass}>
          Welcome to the Franchise Premier League (FPL), a competitive, franchise-based League of Legends league designed to promote balanced teams and showcase emerging talent.
        </p>
        <p className={paragraphClass}>
          FPL uses a structured auction draft system to ensure fair competition and exciting matches throughout the regular season, gauntlet, and playoffs.
        </p>

        <h3 className={subsectionHeadingClass}>Entry Fees &amp; Prizes</h3>
        <ul className={listClass}>
          <li>Captains Entry Fee: $25</li>
          <li>
            1st Place: $200 <HiddenCoin />
          </li>
          <li>2nd Place: $100</li>
          <li>Players Entry Fee: $15</li>
          <li>1st Place: $260 (divided among the 4 players)</li>
          <li>2nd Place: $140 (divided among the 4 players)</li>
        </ul>

        <h3 className={subsectionHeadingClass}>Player/Captain Registration</h3>
        <p className={paragraphClass}>
          Players must sign up to join the player pool by submitting their IGN, Discord, and op.gg multi-link.
        </p>
        <p className={paragraphClass}>
          Captains must apply to be in the captain pool by submitting their IGN, Discord, and op.gg multi-link. (If denied they may become a player).
        </p>
        <p className={paragraphClass}>
          Captains create and manage teams for the full split, including making a team name/logo, participating in the league’s offseason phase, drafting their team in the auction, managing their roster, finding subs/replacement, and making sure their team follows all the rules applicable to the league, etc.
        </p>

        <h3 className={subsectionHeadingClass}>Player Eligibility</h3>
        <p className={paragraphClass}>Players must meet the following requirements:</p>
        <ol className={orderedListClass}>
          <li>150 ranked games (S15 + S16)</li>
          <li>Play at least 5 games every 14 days</li>
          <li>Account level 200+ (if under than reach out to admins)</li>
          <li>Disclose all alternate accounts (all accounts level 30 or above with ranked games)</li>
          <li>
            Must not exceed Masters 100lp in S15 or S16 (Players are allowed to go past rank cap mid-split, however, you will be ineligible for Academy for future splits)
          </li>
          <li>
            Exception players (players that have previously ranked at the cap of M200) are eligible to play if they meet the criteria below
            <ul className={listClass}>
              <li>Exception:</li>
              <li>They must have played at least 200 games in Season 16 since hitting M200.</li>
              <li>Be currently under M100 LP throughout their decline in elo</li>
              <li>
                This request must be submitted via ticket to staff, it will be viewed and a decision will be made by staff. Staff reserves the right to reject exception players on a case-by-case basis
              </li>
            </ul>
          </li>
        </ol>
      </section>

      <section aria-labelledby="league-structure" className="space-y-5">
        <h2 id="league-structure" className={sectionHeadingClass}>
          League Structure
        </h2>

        <h3 className={subsectionHeadingClass}>Beginning of a New Split</h3>
        <p className={paragraphClass}>
          A split starts by captains being selected and a player pool being formed.
        </p>
        <p className={paragraphClass}>
          Once this is complete and everyone has paid their entry fees, staff assign all players in the pool a minimum point value and all selected captains a final point value.
        </p>
        <p className={paragraphClass}>
          The captains’ point values are determined by rank, strength in their role compared to other players in their role, perceived skill, and strength compared to other captains, etc.
        </p>
        <p className={paragraphClass}>
          The players’ min point values are determined by rank, strength in their role compared to other players in their role, perceived skill, and what their expected auction price will be.
        </p>

        <h3 className={subsectionHeadingClass}>
          Phase 1: Market Value (lasts 24 hours)
        </h3>
        <p className={paragraphClass}>
          Once point values are set, each captain will get bids that will be placed blindly on players in the player pool to set their new min point values.
        </p>
        <p className={paragraphClass}>The bids are:</p>
        <ul className={listClass}>
          <li>2- 50 pt bids</li>
          <li>3- 40 pt bids</li>
          <li>2- 30 pt bids</li>
          <li>2- 20 pt bids</li>
          <li>2- 10 pt bids</li>
          <li>1- 5 pt bid</li>
        </ul>
        <p className={paragraphClass}>
          Captains cannot place bids on players in their roles, and bids that are under the players set min point value.
        </p>
        <p className={paragraphClass}>
          After all bids are placed and collected, staff will determine all players&apos; new min point values.
        </p>

        <h3 className={subsectionHeadingClass}>
          Phase 2: Free Agency (lasts 48 hours)
        </h3>
        <p className={paragraphClass}>
          Captains will have to sign one player that they have bidded on for the player’s new set min point value to their team, after each captain does so free agency ends.
        </p>
        <p className={paragraphClass}>
          Each captain must sign one player, and players must accept offers made by a captain, but in the case that the player has multiple offers they may choose the captain they want to sign with.
        </p>
        <p className={paragraphClass}>
          Ultimatums/threats by players are not allowed and will be punished accordingly by staff discretion.
        </p>
        <p className={paragraphClass}>
          For purposes of this section, ‘collusion’ means a pre-arranged agreement between two or more captains or players intended to artificially inflate or suppress a player’s market value.
        </p>
        <p className={paragraphClass}>
          Punishment Examples. - Point Deductions from total allotment, Point Addition to player cost, Removal from League.
        </p>
        <p className={paragraphClass}>
          When free agency ends, each team will subtract from their original 100 points the amount they signed the player in free agency for and the amount the admins assigned them as a captain at the beginning.
        </p>

        <h3 id="auction-draft" className={subsectionHeadingClass}>
          Auction Draft Begins
        </h3>
        <p className={paragraphClass}>
          All remaining players are put in the auction pool for the captains to propose and bid on in front of all.
        </p>
        <p className={paragraphClass}>
          Captains will propose players in a snake draft order for 3 rounds.
        </p>
        <p className={paragraphClass}>
          Captains may not draft, propose, or bid on roles already filled for their team.
        </p>
        <p className={paragraphClass}>
          The order of the draft goes by lowest captain point value to highest captain point value, and if 2 captains have the same point value then it goes by most remaining team points to lowest remaining team points. In the rare case that that is also the same then it will be random among those tied teams.
        </p>
        <p className={paragraphClass}>
          Each round will have a min starting bid for each player proposed.
        </p>
        <p className={paragraphClass}>Minimum bids:</p>
        <ul className={listClass}>
          <li>Round 1: 10 points</li>
          <li>Round 2: 5 points</li>
          <li>Round 3: 1 point</li>
        </ul>
        <p className={paragraphClass}>
          The draft is run by an auctioneer and held in the appropriate discord channel. After a player is proposed and auctioned off, the auctioneer will use the “going once, going twice, sold” method.
        </p>
        <p className={paragraphClass}>
          Once all teams are filled the auction draft is over, and the nemesis draft for team divisions will take place.
        </p>

        <h3 id="nemesis-draft" className={subsectionHeadingClass}>
          Nemesis Draft Begins
        </h3>
        <p className={paragraphClass}>
          The last ordered captain will be chosen and put in one of the divisions.
        </p>
        <p className={paragraphClass}>
          That captain will then choose another captain to put into the other division.
        </p>
        <p className={paragraphClass}>
          This will continue until each division has 6 captains each in them.
        </p>

        <h3 id="league-format" className={subsectionHeadingClass}>
          League Format
        </h3>
        <p className={paragraphClass}>
          Then the league schedule is released and the regular season starts the next Monday at 8pm est.
        </p>
        <p className={paragraphClass}>
          Matches follow the Fearless Format (champions can only be played once a series) and are played weekly on Mondays at 8:00pm est.
        </p>
        <p className={paragraphClass}>
          Each team consists of five players: Top, Jungle, Mid, Adc, and Support.
        </p>
        <p className={paragraphClass}>
          Teams are split into two divisions: Solari and Lunari, assigned through a Nemesis Draft.
        </p>
        <p className={paragraphClass}>
          The regular season consists of 5 weeks of Bo3s done between division teams.
        </p>
        <p className={paragraphClass}>
          Side selection for game 1 is determined prior by staff and for every game after, the side is chosen by the losing team of the previous match in that series. (Same for playoffs)
        </p>
        <p className={paragraphClass}>
          Each team will play each other team in their division once in the regular season.
        </p>
        <p className={paragraphClass}>For Week 1, there are no elo-sitting games required by all players.</p>
        <p className={paragraphClass}>
          After all games in the regular season are played, the league seeding will be produced, the guidelines for the ordering of them are:
        </p>
        <p className={paragraphClass}>Seeding is determined by:</p>
        <ol className={orderedListClass}>
          <li>Series record (# of Bo3s won &amp; lost)</li>
          <li>Game win percentage (wins/total games played)</li>
          <li>Head-to-head (wins/loses between tied teams)</li>
          <li>Average win time (Avg time of series wins, quickest is best)</li>
        </ol>
        <p className={paragraphClass}>
          Rescheduling matches is also allowed (as long as it is within 2 weeks of the original game date) and all parties must agree on the date and time of the reschedule before the original game date.
        </p>
        <p className={paragraphClass}>
          Draftlol or Drafter must be used to draft each game, if down another similar website may be used.
        </p>

        <h3 id="game-rules" className={subsectionHeadingClass}>
          Game Rules/Penalties
        </h3>
        <p className={paragraphClass}>
          The timer for being late to a game starts when one of the teams has all 5 players with their correct quests in the lobby ready to start the draft.
        </p>
        <p className={paragraphClass}>Late to Game 1 penalties:</p>
        <ul className={listClass}>
          <li>10 minutes: -1 ban</li>
          <li>15 minutes: -3 bans</li>
          <li>20 minutes: 1 Game loss</li>
          <li>30 minutes: Series loss</li>
        </ul>
        <p className={paragraphClass}>Late to Games 2-5 penalties:</p>
        <ul className={listClass}>
          <li>5 minutes: -2 bans</li>
          <li>10 minutes: All bans lost</li>
          <li>15 minutes: 1 Game loss</li>
          <li>20 minutes: Series loss</li>
        </ul>
        <p className={paragraphClass}>
          Players must play assigned roles and lane for at least 3 minutes.
        </p>
        <p className={paragraphClass}>
          Pauses are limited to 10 minutes per team per game and cannot occur during combat(After 10 the allotted 10 minutes, the game must resume).
        </p>
        <p className={paragraphClass}>
          No role swapping and teams must take their designated quests.
        </p>

        <h3 id="gauntlet" className={subsectionHeadingClass}>
          Gauntlet
        </h3>
        <p className={paragraphClass}>
          After the seeds are made, the gauntlet phase starts, the top 3 teams from each division head to playoffs, and the bottom 3 teams from each division head to the gauntlet.
        </p>
        <p className={paragraphClass}>
          Gauntlets are BO1 with cross-division matchups prioritized.
        </p>
        <p className={paragraphClass}>
          The 5th seed from Solari plays the 6th seed from Lunari and vice versa of the 6th seed from Solari plays the 5th seed from Lunari.
        </p>
        <p className={paragraphClass}>
          The two winners play the 4th seeds and of the opposite division, if the 2 teams that won round 1 of the gauntlet are in the same division then the lower seed plays the 4th seed of their same division and the higher seed of the round 1 winners plays the 4th seed of the other division. After round 2, we will have 2 teams making it out of the gauntlet.
        </p>
        <p className={paragraphClass}>
          If both teams are different division than they play the opposite division #1 seed in the first round of playoffs.
        </p>
        <p className={paragraphClass}>
          If both team are in the same division than just like gauntlet, the lower seed plays their same division’s #1 seed and the other team plays the other divisions #1 seed.
        </p>
        <p className={paragraphClass}>
          Below you can see an image representing the gauntlet/playoff format and flow, and the particular scenario talked about above having to do with 2 teams in the same division making it out of gauntlet (the image below shows if this was the case for Solari).
        </p>
        <p className={paragraphClass}>
          Also, the two teams that eliminated in the first round of gauntlet, their captains are relegated, meaning they cannot be a captain again in the next split of FPL (they can be a captain again after that 1 split though)(unless admins decide their case was extraordinary, like they had their whole team drop or get removed, etc).
        </p>
        <p className={paragraphClass}>Also, both Bo1s of the gauntlet are on the same day.</p>

        <h3 id="playoffs" className={subsectionHeadingClass}>
          Playoffs
        </h3>
        <p className={paragraphClass}>After the gauntlet ends, the playoffs phase starts.</p>
        <p className={paragraphClass}>
          For game 1 of each series, the higher seed gets side selection (they must tell the other team what side they are selecting 24 hours in advance). Each game’s side after is determined by the loser of the previous game (just like regular season).
        </p>
        <p className={paragraphClass}>
          There are 4 total Bo5s going on the same designated day, which is considered Quarterfinals.
        </p>
        <p className={paragraphClass}>
          Teams who lose their series are eliminated, and teams who win move on to the Semifinals.
        </p>
        <p className={paragraphClass}>
          As previously stated, cross division matches are prioritized, and if there are more teams remaining in one division than the lower seed plays the higher seed in their division and the other one plays the other division’s team.
        </p>
        <p className={paragraphClass}>
          After the 2 matches in Semifinals are finished the winning 2 teams move on to FINALS, and the winner of that match is this split’s CHAMPION.
        </p>
        <GauntletPlayoffFigure />
      </section>

      <section aria-labelledby="additional-rules" className="space-y-5">
        <h2 id="additional-rules" className={sectionHeadingClass}>
          Additional Rules &amp; Aspects of the League
        </h2>

        <h3 className={subsectionHeadingClass}>Trades</h3>
        <p className={paragraphClass}>
          Trades between teams are allowed until the Sunday before Week 5 and require approval.
        </p>
        <p className={paragraphClass}>
          Trades must be approved by 2 out of the 3 groups (aka FPL’s checks and balances)
        </p>
        <ol className={orderedListClass}>
          <li>Head Founder/Staff for the split</li>
          <li>Player Reps (need a majority of the total assigned)</li>
          <li>Captains</li>
        </ol>
        <p className={paragraphClass}>Captains and players involved in the trade will not have their votes counted.</p>

        <h3 className={subsectionHeadingClass}>Subs/Esubs/Replacements</h3>
        <p className={paragraphClass}>
          Teams may use substitutes with restrictions and penalties for emergency usage.
        </p>
        <p className={paragraphClass}>
          Mid-series substitutions result in additional penalties and restrictions.
        </p>
        <p className={paragraphClass}>
          Teams can submit subs 24 hours in advance of game time, with no penalty (max 2 subs).
        </p>
        <p className={paragraphClass}>
          If not within 24 hours then -1 ban for each sub in every game of the series in the first ban phase (unless it is the staff’s fault it is not reviewed in a timely manner).
        </p>
        <p className={paragraphClass}>All subs must be follow these rules:</p>
        <ol className={orderedListClass}>
          <li>Equal to or lower current rank of original player</li>
          <li>
            Their peak rank in S15/S16 of original player cannot be in a higher division
            <p className={paragraphClass}>
              Examples: (Good=Plat 1 for E4 peaks, Bad= Diamond 4 for Emerald 1 peaks)
            </p>
          </li>
          <li>Abide by all player eligibility rules seen in Player Eligibility</li>
        </ol>
        <p className={paragraphClass}>
          League staff reserve the right to deny a sub if the player jeopardizes league integrity (elo-sitter, etc).
        </p>
        <p className={paragraphClass}>
          In the rare scenario a team needs 3 subs, they will FF game 1 of the Bo3 or games 1 &amp; 2 of the Bo5 (3 subs not allowed in gauntlet) AND they will lose all first phase bans in each game..
        </p>
        <p className={paragraphClass}>
          Replacements must abide by all regular sub rules. (also must be submitted no longer than 1 week after a player drops/gets removed)
        </p>

        <h3 className={subsectionHeadingClass}>Mid Series Subs</h3>
        <p className={paragraphClass}>Mid series subs must abide by all regular sub rules.</p>
        <p className={paragraphClass}>
          Teams have 15 mins to find an esub after the previous game has finished
        </p>
        <p className={paragraphClass}>In a Bo3, teams lose all first phase bans in remaining games.</p>
        <p className={paragraphClass}>In a Bo5:</p>
        <ul className={listClass}>
          <li>Joins Game 2: Team loses 2 bans</li>
          <li>Joins Game 3: Team loses all bans</li>
          <li>
            Joins Game 4: Team FFs game 4 and sub may be allowed to play game 5 unless they lose the series with this FF
          </li>
          <li>After Game 4 has ended no mid-series esubs are allowed.</li>
        </ul>

        <h3 className={subsectionHeadingClass}>Conduct &amp; Integrity</h3>
        <p className={paragraphClass}>The following actions are strictly prohibited:</p>
        <ul className={listClass}>
          <li>Cheating or scripting</li>
          <li>Smurfing/account sharing</li>
          <li>Match-fixing</li>
          <li>Stream sniping.</li>
        </ul>

        <h3 className={subsectionHeadingClass}>Unprofessional Conduct</h3>
        <p className={paragraphClass}>The following behaviors are strictly prohibited:</p>
        <p className={paragraphClass}>
          Harassment: Persistent or severe actions intended to disturb, threaten, or demean individuals or groups, including but not limited to:
        </p>
        <ul className={listClass}>
          <li>Insults, slurs, or offensive remarks related to race, ethnicity, nationality, gender, sexual orientation, religion, or disability.</li>
        </ul>
        <p className={paragraphClass}>
          Abusive Behavior: Excessive flaming, toxic language, or threats directed at opponents, teammates, staff, or community members.
        </p>
        <p className={paragraphClass}>
          Disruptive to the League: Actions that harm the reputation or integrity of the FPL, including:
        </p>
        <ul className={listClass}>
          <li>Posting inappropriate or offensive content associated with the FPL brand.</li>
        </ul>
        <p className={paragraphClass}>
          Players can be removed from the league under strenuous circumstances that involve behavioral issues, attendance issues, etc.
        </p>
        <p className={paragraphClass}>
          Players must use appropriate language in all official league communications, and are not allowed to mute all, deafen, etc their teammates in official games.
        </p>
        <p className={paragraphClass}>Any problems please create a ticket and staff will handle the situation accordingly.</p>

        <h3 className={subsectionHeadingClass}>Streaming &amp; Content</h3>
        <p className={paragraphClass}>Matches may be streamed.</p>
        <p className={paragraphClass}>A 3-minute delay is recommended.</p>
        <p className={paragraphClass}>Results must not be shared before official confirmation.</p>

        <h3 className={subsectionHeadingClass}>Rule Amendments</h3>
        <p className={paragraphClass}>Rules may be updated at any time and will be publicly announced.</p>
        <p className={paragraphClass}>
          Changes will not apply retroactively unless necessary for competitive integrity.
        </p>
      </section>

      <section aria-labelledby="staff" className="space-y-5">
        <h2 id="staff" className={sectionHeadingClass}>
          FPL Staff
        </h2>
        <p className={paragraphClass}>Founders: Rutledge, Jake, JayDK, &amp; Repped</p>
        <p className={paragraphClass}>Staff: Dribb, Jules, Sunset Diner, Geoff, Luke</p>
        <p className={paragraphClass}>
          All rules and guidelines are subject to interpretation by League Staff. No Rulebook is perfect and not every rule can be listed and detailed. Staff members have final decision making on rulings.
        </p>
        <p className={paragraphClass}>Made by Lizzo Mukkbang</p>
      </section>
    </article>
  );
}
