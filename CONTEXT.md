# Domain glossary

## Daily games

- **Shared daily reward**: One 200-betting-dollar reward per member and UTC puzzle date, increased to 300 while the member's patron flame is active. Completing any enabled daily game—FPL'dle, Higher or Lower, or Guess the Card—claims it; completing another game later does not pay again.

## Guess the Card

- **Daily puzzle**: One frozen completed `raw_stats` game per league and UTC date, shared by every player; Premier and Academy never share candidates or answers.
- **Reveal stage**: The progressive safe DTO: role at start, then champion, combat, damage, economy, and finally match/player identity after a win or five misses. The answer JSON remains server-only.
- **Admin test gate**: Guess the Card currently permits admins with a betting wallet only. The Premium Hub tile is visible as a test surface, while server actions and database grants keep gameplay data protected.

## Higher or Lower

- **Daily run**: One Premium member's scored Higher or Lower attempt for one league and one UTC puzzle date. The first incorrect or timed-out comparison ends the run; 45 correct rounds completes a perfect run. Premium members may start unlimited attempts, and each attempt receives a private random sequence that remains stable across refreshes.
- **Round**: One comparison between a fully revealed reference player card and a challenger card that initially exposes only player identity and art. The member has 20 seconds to choose Higher or Lower after the round starts.
- **Run score**: Number of consecutive correct rounds in a Daily run. Use this term instead of *streak*, which elsewhere means consecutive active days.
- **Weekly leaderboard**: Combined Premier and Academy ranking of each Premium member's highest Daily run score during one Monday-through-Sunday UTC competition week.
- **Weekly winners**: All Premium members tied for highest Run score when the completed week settles at 8:00 PM Eastern on Monday. They split one fixed 2,000-betting-dollar prize pool.
