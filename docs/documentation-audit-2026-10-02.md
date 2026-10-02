# Repository guidance and documentation audit — 2026-10-02

## Scope

Compared current agent guidance, README, frontend/design references, backend
contracts, testing/release instructions, daily-game terminology, and Season's
End references with the working-tree source. Existing uncommitted changes were
preserved; this audit adds documentation changes only. Dated plans, prototypes,
and previous audit reports remain historical records.

This is a source/documentation audit, not certification of the deployed app,
remote migration history, live permissions, or every application behavior.

## Corrections

| Finding | Correction and source evidence |
| --- | --- |
| No current frontend reference; agent routing omitted design sources | Added [frontend.md](frontend.md), linked it from AGENTS and README, and documented ownership of themes, fonts, shells, navigation, and rendering boundaries. Sources: root layout, global CSS, feature CSS Modules, and installed Next.js guides. |
| Full-width spacing guidance contradicted newer designs | Replaced the stale exhaustive route table with shell ownership. League/cards cap at 1440px, home at 1600px, betting at `max-w-6xl`. Retained base spacing utilities and marked prior screenshots as historical. Sources: shell CSS and betting layout. |
| Navigation described three direct links, Premium/Info menus, and a cards league switcher | Documented My Team plus League/Cards/Play/About, staff placement, current card sub-navigation, and header league switching. Sources: `SiteNavigation`, `CardsTabs`, route and destination maps. |
| Weekly draw described a fixed Tuesday cron and half-hour delay | Documented successful automated upstream completion, manual dispatch, and the anti-cascade guard. Sources: `.github/workflows/weekly-draw.yml` and ingestion workflow. Corrected Production secret placement and cloud URL guidance. |
| Backend workflow index omitted newer jobs | Added Higher or Lower settlement, expedition sweep, and manual offseason ingestion, with their entry points and triggers. |
| Higher or Lower glossary used a UTC puzzle date | Corrected it to Eastern while retaining UTC competition weeks. Sources: `dailyDay.ts`, Higher or Lower server/rules, and settlement script. |
| Testing guide omitted route tests and offseason Python discovery | Aligned descriptions with `vitest.config.mts`, package scripts, and the current Python test modules. Fixed README's Playwright heading link. |
| Backend cited a deleted slug bridge and an obsolete expedition ceiling | Linked actual TypeScript/pgTAP coverage and the current derived payout calculation instead of claiming a removed test guarantees parity. |
| Season's End preview described the pre-release feature and single-pass selection | Documented staff release controls, service reads, three-pass selection, actual renderers, and database dependencies. Removed broken links to a missing ranking plan. |
| Season's End commerce claimed blanket auto-dust protection | Distinguished weekly-card exclusion from its dedicated exact-variant duplicate auto-dust system. Sources: release queries, auto-dust server/RPC, and admin page. |

## Verification

- Reviewed the audit edits against their owning source files and the installed
  Next.js server/client, CSS, and cookie API documentation.
- Checked current-reference relative links and heading anchors, literal source
  paths, and documented `npm run` names against the filesystem/package scripts.
  Generated staging directories and wildcard examples are not required to exist.
- Ran `git diff --check`.
- No runtime code or schema was changed by this audit. Per the repository's
  Markdown-only test policy, no app build, browser suite, or database fixtures
  were run for these edits.

## Remaining verification limits

The Supabase server helper contains a legacy comment about middleware refresh,
but this checkout has no middleware/proxy implementation. The backend reference
now states the actual boundary. Expired-session recovery needs a dedicated
behavioral check before changing authentication; source inspection alone does
not establish a runtime failure or prove recovery works.

Remote Supabase/Vercel configuration, applied migrations, live schedules, and
populated/authenticated browser states were not inspected. The release and
local infrastructure verification requirements remain in force. Old passing
counts and screenshots were not carried forward as current results.
