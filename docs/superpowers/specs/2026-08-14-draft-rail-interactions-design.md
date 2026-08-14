# Draft Rail Interactions Design

## Goal

Improve the desktop draft board’s monitoring experience by making team cards independently collapsible, adding a bulk collapse/expand control, ensuring chat follows the user while scrolling, and making the player pool below the admin controls more compact while preserving its current filtering and drafted-player treatment.

## Approved interaction design

### Collapsible teams

- All team cards start expanded.
- Each `TeamColumn` gets a per-card collapse/expand control.
- The teams rail gets a `Collapse all` / `Expand all` control.
- Bulk actions broadcast the requested state to each card but do not remove independent control: after collapsing all, a user can expand one team without expanding every team.
- Team identity, nominator highlighting, current-team highlighting, roster data, and budget remain visible in the expanded card. The collapsed card retains a compact header and its state control.
- Teams remain expanded by default in the mobile/tablet stacked layout; the same controls remain available there.

The collapse state is presentational UI state only. `TeamColumn` owns its local state; `DraftBoard` owns a bulk-action signal/value and passes it to each card. No draft state or data flow changes.

### Sticky chat

The chat rail itself becomes the sticky grid item, positioned below the site navigation with a viewport-relative height. Its message list remains the only scrolling region inside the panel, while the header and composer remain available. The rail does not use fixed positioning or cover the auction workspace, and it returns to the existing compact, normal-flow chat panel below the desktop breakpoint.

### Compact player pool

The existing `PlayerPool` remains the single source of truth and keeps its search field, role filters, alphabetical ordering, and team-name display. Its compact variant reduces spacing, row height, and typography to make the pool fit better beneath the admin controls. Players already drafted remain crossed out and visually secondary; available players remain prominent. This is a presentation change only.

## Component changes

- `TeamColumn`: add local expanded/collapsed state, accessible toggle, compact collapsed header, and a bulk-collapse synchronization prop.
- `DraftBoard`: add the teams rail bulk control, pass the bulk state/signal to every `TeamColumn`, and move sticky positioning to the chat rail wrapper.
- `DraftChat`: retain the existing optional class hook and ensure the rail wrapper owns sticky sizing while the message list scrolls internally.
- `PlayerPool`: add compact presentation classes/prop without changing query, filter, sort, or drafted-player logic.

## Verification

- Add TeamColumn tests for expanded-by-default behavior, individual collapse/expand, and bulk state synchronization.
- Add/update DraftBoard tests for the bulk control and all teams remaining rendered in the rail.
- Preserve existing DraftChat and PlayerPool behavior tests; add a compact variant assertion if needed.
- Run all draft tests, lint, and the production build path available in the repository.
- Run `git diff --check` and inspect the desktop/mobile class ordering.

## Out of scope

- Persisting collapse state across page reloads or users.
- Changing chat subscriptions, moderation, message ordering, or composer behavior.
- Changing player eligibility, search semantics, filters, sort order, or draft actions.
