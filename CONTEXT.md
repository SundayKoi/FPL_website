# Domain glossary

Use this reference for daily-game terminology. Current behavior and access gates
are defined by the domain code and database migrations; verify mutable values
there when changing a game. This file is not a required read for other work.

## Daily games

- **Puzzle date**: FPL'dle, Higher or Lower, and Guess the Card use the shared daily-game helper in `src/lib/dailyDay.ts`. It changes at midnight America/New_York, including daylight-saving transitions.
- **Shared puzzle reward**: One 200-betting-dollar reward per member, puzzle date, and league, increased to 300 while the member's patron flame is active. The first completed eligible puzzle—FPL'dle, Higher or Lower, or the admin-only Guess the Card test—claims it. Completing another puzzle in that league on that puzzle date does not pay again. Premier and Academy claims are independent.
- **Daily Stu vote reward**: The Daily Stu check has a separate 200-betting-dollar vote reward, increased to 300 while the member's patron flame is active. It uses a UTC check date and its own claim, independent of puzzle completion.

## Guess the Card

- **Daily puzzle**: One frozen completed `raw_stats` game per league and Eastern puzzle date, shared by every player; Premier and Academy never share candidates or answers.
- **Reveal stage**: The progressive safe DTO: role at start, then champion, combat, damage, economy, and finally match/player identity after a win or five misses. The answer JSON remains server-only.
- **Admin test gate**: Guess the Card currently permits admins with a betting wallet only. The Premium Hub tile and Play navigation entry are visible to true admins as a labelled test surface; server actions and database grants keep gameplay data protected.

## Higher or Lower

- **Daily run**: One Premium member's scored Higher or Lower attempt for one league and one Eastern puzzle date. The first incorrect or timed-out comparison ends the run; 45 correct rounds completes a perfect run. Premium members may start unlimited attempts, and each attempt receives a private random sequence that remains stable across refreshes.
- **Round**: One comparison between a fully revealed reference player card and a challenger card that initially exposes only player identity and art. The member has 20 seconds to choose Higher or Lower after the round starts.
- **Run score**: Number of consecutive correct rounds in a Daily run. Use this term instead of *streak*, which elsewhere means consecutive active days.
- **Weekly leaderboard**: Combined Premier and Academy ranking of each Premium member's highest Daily run score during one Monday-through-Sunday UTC competition week. This UTC competition week is separate from the Eastern daily puzzle date.
- **Weekly winners**: All Premium members tied for highest Run score when the completed week settles at 8:00 PM Eastern on Monday. They split one fixed 2,000-betting-dollar prize pool.
