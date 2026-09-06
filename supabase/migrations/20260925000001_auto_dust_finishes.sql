-- Auto-dust keeps its hands off the finishes.
--
-- A rule that melts duplicates should not melt a Shiny or a StatTrak
-- copy on the way past: they are the rare thing about a pull, and a
-- StatTrak count is a thing the owner has been building. `skip_finishes`
-- is the toggle (on by default — melting them is opt-in), read and
-- written by the site's rule server alongside skip_foil and skip_signed.
-- A Secret and a slabbed copy are never touched by a rule at all, the
-- way a mutated copy is not; that needs no column.

alter table public.card_auto_dust
  add column if not exists skip_finishes boolean not null default true;
