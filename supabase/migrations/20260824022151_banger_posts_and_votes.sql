create table public.banger_posts (
  id text primary key,
  author_handle text not null default 'Stuart69Davis',
  body text not null,
  published_at timestamptz not null,
  x_url text not null unique,
  created_at timestamptz not null default now(),
  constraint banger_posts_author_check check (author_handle = 'Stuart69Davis')
);

create table public.banger_votes (
  post_id text not null references public.banger_posts(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  vote text not null check (vote in ('banger', 'mid')),
  created_at timestamptz not null default now(),
  primary key (post_id, voter_id)
);

alter table public.banger_posts enable row level security;
alter table public.banger_votes enable row level security;

grant select on public.banger_posts to anon, authenticated;
grant select, insert, update on public.banger_votes to authenticated;

create policy "Anyone can read banger posts"
  on public.banger_posts for select
  to anon, authenticated
  using (true);

create policy "Users can read their own banger votes"
  on public.banger_votes for select
  to authenticated
  using ((select auth.uid()) = voter_id);

create policy "Users can cast their own banger votes"
  on public.banger_votes for insert
  to authenticated
  with check ((select auth.uid()) = voter_id);

create policy "Users can change their own banger votes"
  on public.banger_votes for update
  to authenticated
  using ((select auth.uid()) = voter_id)
  with check ((select auth.uid()) = voter_id);

insert into public.banger_posts (id, body, published_at, x_url)
values
  ('2091292862696853627', 'Woke up with cum in my pants #Aintnorestforthewicked', '2026-08-22T00:00:00Z', 'https://x.com/Stuart69Davis/status/2091292862696853627'),
  ('2090789639582097901', 'Adopting Mexican culture so I can put vaporub on her bare feet', '2026-08-21T00:00:00Z', 'https://x.com/Stuart69Davis/status/2090789639582097901'),
  ('2088435761075065087', 'Sneezing is like cumming but out your nose', '2026-08-15T00:00:00Z', 'https://x.com/Stuart69Davis/status/2088435761075065087'),
  ('2087803587082731621', 'giving birth to straight sack #placentapeople', '2026-08-13T00:00:00Z', 'https://x.com/Stuart69Davis/status/2087803587082731621')
on conflict (id) do update set
  body = excluded.body,
  published_at = excluded.published_at,
  x_url = excluded.x_url;
