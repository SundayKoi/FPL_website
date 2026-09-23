# FPL admin dashboard — design prototype and implementation

These high-fidelity visual prototypes informed the implemented admin overview at `/admin` and tool directory at `/admin/tools`. The prototype images remain static references; their controls are not interactive. The application routes use live schedule/settings data where available and preserve the existing server-side role checks.

## Screens

- [Operations overview](01-overview.png): attention queue, persistent league/season context, featured matchup, quick actions, upcoming series, recent activity.
- [All tools](02-all-tools.png): comprehensive grouped directory with a separate Design Lab.

## Design references

These mockups adapt visual patterns from the following references; no third-party component source has been installed or integrated.

- [21st: shadcn Sidebar](https://21st.dev/@shadcn/components/sidebar)
- [21st: Underlined Navigation Menu](https://21st.dev/@shadcnui-blocks/components/navigation-menu-05)
- [21st: Tables](https://21st.dev/community/components/s/table)
- [Impeccable: Designing](https://impeccable.style/designing/)
- [Impeccable: Anti-patterns](https://impeccable.style/slop/)

The design uses a compact black masthead, white workspace, persistent grouped sidebar, violet selection/actions, condensed headings, and fine table dividers. Operational priority takes precedence over a wall of equally prominent destination cards.

## Current-feature mapping

Reviewed against src/app/admin/page.tsx.

| Group | Existing features |
| --- | --- |
| League | Signups; Schedule and season/phase; Players and average bids; Teams and rosters; Draft manager |
| Cards & rewards | Player claims; Season’s End; The Send-off; On Air; Expedition seasons |
| Broadcast & content | Premier/Academy featured matchup editors; homepage mode; Announcements; The Daily Stu title editor |
| Economy & insights | Betting, including markets, pick’ems, catalog, seasons and users; Analytics; Patrons |
| Staff & access | Staff roles |
| Design Lab | Parallels; Skin-line parallels; Expedition mutations; Card overlays; The Dribb card; God Pack preview; Guess the Card |

The existing duplicate Season’s End destination becomes one directory entry.

## Review and implementation notes

- The overview reads the selected league/season's schedule and current admin settings. Schedule rows exclude completed fixtures; the count reflects all upcoming fixtures, not only the visible rows.
- The attention queue and recent activity feed are illustrative sample content. They are not backed by newly invented aggregation endpoints or presented as verified live operational data.
- League and season context is carried into scoped schedule, player, team, and feature-editor destinations. Homepage mode and signup settings are global; the shell calls out that distinction rather than implying every tool is scoped.
- Existing server-side role checks and page controls remain authoritative. Broad admins, owners, and broadcasters retain their distinct access; owner-only tools remain locked in the directory for other roles. Badges and disabled presentation are not authorization mechanisms.
- The generated overview's “Live ready” label remains illustrative, not a verified broadcast status.
- The implemented All Tools page has its own active location and category filters. Search works from the directory and the shell's Command-K control; tool links lead into the existing workspaces.
- The prototype's “View all” queue concept is represented as a sample queue; no full queue aggregator was introduced. The upcoming schedule is sourced from fixtures.
- The shell adapts its navigation for smaller screens and keeps league/season context available. An authenticated responsive visual pass remains to be done.
- Verification: the implementation was typechecked and whitespace-checked. Application tests were not run. A local browser session is open at sign-in because `/admin` correctly redirects while signed out; authenticated visual verification requires a staff account.

## Generation prompts

### 01 — Overview

Use case: ui-mockup.
Asset type: high-fidelity desktop design prototype, flat screenshot, landscape 1536x1024. Create a complete redesigned FPL ADMIN dashboard, extremely polished, crisp readable text and purposeful whitespace. FPL is a community League of Legends esports league with paired Premier and Academy leagues, NOT football. This is a prototype, illustrative data. Inspired by 21st.dev shadcn Sidebar, underlined navigation and clean data tables; Impeccable hierarchy, restrained color, no equal-weight tile wall. Sports editorial meets precise professional operations console. White/offwhite workspace, near-black masthead, very pale gray sidebar, near-black text, vivid violet #6D3DF5 only for primary actions/active states. Clean neutral grotesk body typography and bold condensed display title. Hairline gray dividers, small 6px corner radii, almost no shadows. No gradients, glow, glass, 3D objects or decorative stock photography.
Layout:
Top 64px black global masthead with white FPL wordmark left, navigation Stats, My Team, Cards, League, Premium, Info, Admin (active violet underline), small avatar MW right.
Left sidebar width 224px below masthead: ADMINISTRATION small eyebrow. Overview selected pale lavender row with violet line icon. Group LEAGUE: Signups, Schedule, Players & teams, Draft room. Group EXPERIENCE: Cards & rewards, Betting, Broadcast & content, Analytics. Group WORKSPACE: Design lab, Staff & access, Patrons. Small Owner label near Staff & access and Patrons. Bottom modest "Prototype / Sample data".
Main region starts x260. Top utility bar shows Premier / Academy segmented league selector with Premier active, Season 5 dropdown, right Search tools with keyboard command K. A clear scoped context persists.
Large headline "LEAGUE OPERATIONS" with subtitle "Your next actions, matches and publishing controls." Right small date "WED, 23 SEP" and outlined "All tools ↗".
Below heading compact horizontal status strip divided by vertical lines, not tiles: Season 5 • Playoffs; Signups Closed; 4 Upcoming series; 6 Awaiting review.
Main middle split: 65% left big actionable queue titled "Needs attention" with small count 6, subtle tabs All 6 / Match reports 3 / Player claims 2 / Publishing 1. Table/list of four roomy rows, left small minimal icons, subject and secondary detail, right action link: "Night Shift vs Red Side" / "Match report · Game 2 · 18 min ago" / Review →; "Blue Buff vs Rift Rats" / "Match report · Game 1 · 42 min ago" / Review →; "2 player identity claims" / "Card ownership · Waiting for approval" / Review →; "Weekly card announcement" / "Draft ready · Not published" / Preview →. Lower small text "View all 6 items →". Make this the most prominent panel, bounded by simple rules not bulky cards.
Right 35% narrow dark charcoal broadcast module titled "HOMEPAGE & BROADCAST", Premier · Season 5. Featured match Night Shift / vs / Red Side, compact fantasy shield symbols, text "FRI 25 SEP · 8:00 PM CT". A small geometric violet accent only. "Homepage mode   Automatic" understated label. White outlined button "Edit featured matchup". Below on white a section "Quick actions" with four compact divided links: Edit fixtures →, Review signups →, Manage rosters →, Open draft room →.
Lower left upcoming-series ruled table title "This week" and View schedule →, three columns Match / Starts / Status, 3 rows Night Shift vs Red Side / Fri 8:00 PM / Scheduled; Blue Buff vs Rift Rats / Fri 9:00 PM / Codes ready; Ember vs Oracle / Sat 8:00 PM / Needs codes. Small colored dots and plain status text, not pills.
Lower right white section "Recent activity" chronological three short rows: Featured matchup updated • 12 min; Claim approved • 38 min; Fixtures edited • 1 hr.
Footer subtle "FPL / ADMIN CONCEPT 01" and "Illustrative data · Owner view". Ensure entire composition fits with 32px outer whitespace. A sophisticated immediately usable admin dashboard, not a marketing page. All labels sharp, real controls proportioned correctly.

### 02 — All tools

Reference: the generated overview image.

Use case: ui-mockup. Create a second high-fidelity desktop FPL admin prototype screenshot, 1536x1024 landscape, using the reference image as the exact design-system and shell reference. Preserve its black global masthead, white workspace, pale gray left sidebar, typography, violet accent, crisp hairlines, spacing and control scale. This new screen is ALL TOOLS, a well-organized comprehensive directory of existing administrative tools, not another overview. FPL is League of Legends esports, not football. Prototype only with illustrative data.
Keep header FPL, Stats, My Team, Cards, League, Premium, Info, Admin active, MW avatar. Same sidebar grouped into Overview; LEAGUE: Signups, Schedule, Players & teams, Draft room; EXPERIENCE: Cards & rewards, Betting, Broadcast & content, Analytics; WORKSPACE: Design lab, Staff & access, Patrons. Owner markers for Staff & access and Patrons. Same main utility row Premier active / Academy; Season 5; Search tools with Command K.
Main title ALL TOOLS, subtitle "Everything has a place. Find a tool and get to work." Right compact outlined "← Overview".
Below title underlined category navigation All tools, League, Cards, Content, Owner. All tools active violet underline. The layout is a calm editorial directory, dense but airy, no repeated tile grid. Main left 72% width has TWO columns of grouped ruled text lists with section name in bold and a tiny section number. Each row label + concise secondary description and right small arrow. Main right 28% a pale lilac Design lab section with clear label "PREVIEWS & EXPERIMENTS" and compact names divided by fine lines. This entire screen fits without clipping and uses legible body text.
Main column 1:
01 LEAGUE
Signups — Window & player applications
Schedule — Fixtures, scores & season phase
Players — Pool & average bids
Teams — Captains, identity & rosters
Draft room — Auctions & assignments [small Owner text]

02 BROADCAST & CONTENT
Homepage — Featured matches & display mode
Announcements — Prepared channel posts
The Daily Stu — Titles & editorial controls

Main column 2:
03 CARDS & REWARDS
Player claims — Identity & ownership reviews
Season's End — Regular-season honors
The Send-off — Playoff editions
On Air — Live-drop caster cards
Expedition seasons — Standings & season close

04 ECONOMY & INSIGHTS
Betting — Markets, pick'ems & catalog
Analytics — Activity, pulls & balances
Patrons — Receipts & grants [Owner text]
Staff & access — Roles & permissions [Owner text]

Right pale lilac rail:
small flask line icon then DESIGN LAB in bold condensed type.
"Explore treatments before they ship." small explanatory line.
Readable list rows:
Parallels
Skin-line parallels
Expedition mutations
Card overlays
The Dribb card
God Pack preview
Guess the Card
A restrained outlined "Open design lab →" button beneath.
Below rail separated small note "A quieter workspace" in black with text "Previews live here, leaving daily operations focused." No claim of access enforcement.
Footer "FPL / ADMIN CONCEPT 02" and "Illustrative data · Owner view".
No marketing illustrations, gradients, glows, card art, random metrics, or extra sections. All content is UI, perfectly straight front-facing screenshot. Detailed polished professional information architecture with very legible exact labels.
