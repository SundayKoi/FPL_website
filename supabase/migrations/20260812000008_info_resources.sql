create table public.info_resources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  description text not null,
  href text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.info_resources enable row level security;

create policy info_resources_public_select on public.info_resources
  for select using (true);
create policy info_resources_admin_write on public.info_resources
  for all using (public.is_admin()) with check (public.is_admin());

grant select on public.info_resources to anon, authenticated;
grant all on public.info_resources to service_role;

insert into public.info_resources (slug, label, description, href, sort_order)
values
  ('payment', 'Payment', 'Send league payments through the official FPL Draft PayPal.', 'https://www.paypal.com/paypalme/DraftFPL', 1),
  ('masterdoc', 'MasterDoc', 'Open the shared league spreadsheet for the latest working data.', 'https://docs.google.com/spreadsheets/d/187hoKxxeSpSPtDAmlrTOeuDrcz5kpdwv1qgQ5kipaHY/edit?usp=sharing', 2),
  ('rulebook', 'Rulebook', 'Read the formatted Rulebook here or open the source Google Doc.', 'https://docs.google.com/document/d/1rtYs_uhNwp7lwMaUfprRLKlOy0UuXWTs/edit#heading=h.k95um6blnxq7', 3);
