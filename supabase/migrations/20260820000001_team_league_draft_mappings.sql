alter table public.league_settings
  add column if not exists academy_draft_id uuid references public.drafts(id) on delete set null;

update public.league_settings settings
set academy_draft_id = academy.id
from (
  select id
  from public.drafts
  where name = 'S1 Academy'
  order by created_at desc
  limit 1
) academy
where settings.id = 1
  and settings.academy_draft_id is null;
