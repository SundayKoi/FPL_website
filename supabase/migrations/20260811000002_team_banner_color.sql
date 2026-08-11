alter table public.teams
  add column banner_color text not null default '#083344';

alter table public.teams
  add constraint teams_banner_color_hex_check
  check (banner_color ~ '^#[0-9A-Fa-f]{6}$');
