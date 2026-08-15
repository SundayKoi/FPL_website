alter table public.drafts
  add column if not exists starts_at timestamptz;
