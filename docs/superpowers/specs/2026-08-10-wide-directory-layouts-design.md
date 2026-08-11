# Wide Directory Layouts Design

## Goal

Give the `/players` and `/teams` pages more horizontal room so dense directory content is easier to scan, while keeping the existing visual system and mobile behavior intact.

## Approved design

- Players uses a larger desktop page container (`max-w-[1800px]`). At extra-large widths, its five-role grid gets a larger minimum width and localized horizontal scrolling so the five spreadsheet-like columns remain readable. Player names use `whitespace-nowrap` so they do not wrap onto a second line.
- Teams uses the same larger desktop page container. Its roster cards remain three columns at normal desktop widths and use four columns at `2xl` widths so the extra canvas is used without making cards excessively wide.
- Below the desktop breakpoints, existing stacked/two-column responsive behavior remains unchanged.

## Scope

Modify only `src/components/players/PlayersDirectory.tsx` and `src/components/teams/TeamsDirectory.tsx`. Existing tests remain valid; run focused directory tests, the full suite, lint, and the production build after the change.
