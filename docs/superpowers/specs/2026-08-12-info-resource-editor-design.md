# Info Resource Editor

**Date:** 2026-08-12
**Status:** Approved design

## Purpose

Allow league admins to update the public Info page’s linked resources without editing code or redeploying. Public visitors continue to see the same resource cards and Rulebook content.

## Data model

Add a Supabase `info_resources` table with:

- `id uuid primary key`
- `slug text unique not null` for stable keys (`payment`, `masterdoc`, `rulebook`)
- `label text not null`
- `description text not null`
- `href text not null`
- `sort_order integer not null`
- `created_at` and `updated_at` timestamps

Seed the existing three resources in display order. Enable RLS with public read access and admin-only insert/update/delete access through `public.is_admin()`.

## Page behavior

The server-rendered Info page fetches resources from Supabase, orders by `sort_order`, and passes them to the existing resource cards. The Rulebook source link uses the persisted `rulebook` row. If the query fails or returns no rows, the page uses the current hardcoded values as a safe fallback.

Admins see an edit panel below the resource cards with label, description, and URL fields for each resource. Saving updates the rows and refreshes the page. Non-admins never see the editor; RLS remains the enforcement boundary.

## Testing and verification

- Test the resource editor’s initial values, save action, success/error states, and admin-only rendering boundary.
- Test the Info page’s database-backed rendering and Rulebook link.
- Add migration/RLS coverage consistent with existing Supabase tests.
- Run focused tests, project-scoped full tests, lint, and production build.

## Scope

This change does not make Rulebook body content editable. It only makes the three linked resource cards and their metadata editable.
