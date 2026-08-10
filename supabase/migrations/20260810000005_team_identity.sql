alter table public.teams
  add column abbreviation text not null default 'TEAM',
  add column image_url text;

update public.teams t
set abbreviation = coalesce(
  nullif(upper(left(
    (
      select string_agg(left(word, 1), '' order by word_position)
      from unnest(regexp_split_to_array(trim(t.name), '\s+'))
        with ordinality as words(word, word_position)
      where word <> ''
    ),
    5
  )), ''),
  'TEAM'
);

alter table public.teams
  add constraint teams_abbreviation_length_check
  check (char_length(trim(abbreviation)) between 1 and 5);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'team-images',
  'team-images',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists team_images_public_read on storage.objects;
drop policy if exists team_images_admin_insert on storage.objects;
drop policy if exists team_images_admin_update on storage.objects;
drop policy if exists team_images_admin_delete on storage.objects;

create policy team_images_public_read
  on storage.objects for select
  using (bucket_id = 'team-images');

create policy team_images_admin_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'team-images' and public.is_admin());

create policy team_images_admin_update
  on storage.objects for update to authenticated
  using (bucket_id = 'team-images' and public.is_admin())
  with check (bucket_id = 'team-images' and public.is_admin());

create policy team_images_admin_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'team-images' and public.is_admin());
