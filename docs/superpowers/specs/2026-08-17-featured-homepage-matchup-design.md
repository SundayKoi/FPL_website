# Featured Homepage Matchup Editing

## Goal

Allow homepage owners and admins to control the featured matchup presentation independently for the Premier and Academy homepages.

## Design

Add three optional, homepage-scoped settings for each homepage: selected fixture ID, featured title, and supporting description. Store them in a dedicated `homepage_featured_settings` table so owner/admin writes cannot broaden access to unrelated league settings. Public homepage rendering reads the settings and resolves the selected fixture from the existing schedule data. If the fixture override is absent or invalid, rendering falls back to the current first scheduled fixture. Empty title or description values fall back to the existing copy.

The shared `FeaturedMatchup` component receives the resolved title and description, so both homepages use the same presentation while retaining independent content. Team names, kickoff, division, and best-of format always come from the selected schedule fixture rather than manually entered text.

## Editing and authorization

The existing admin page gains separate Premier and Academy editor sections. Each editor offers a fixture selector populated from that homepage's available schedule, a title input, and a supporting-text textarea. Save feedback and errors follow existing admin editor patterns. Visibility is gated to owners/admins, and the database write policy must enforce the same owner-or-admin rule rather than relying only on presentation gating.

## Testing

- Unit-test settings parsing and safe fallback behavior.
- Component-test the editable title and supporting text reaching the featured card.
- Test the admin editor's scoped payload for Premier versus Academy and save/error states.
- Run the relevant Vitest suite, lint, and the production build.
