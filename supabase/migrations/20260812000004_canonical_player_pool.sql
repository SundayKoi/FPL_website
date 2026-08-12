create table public.player_pool (
  id uuid primary key default gen_random_uuid(),
  season_key text not null,
  normalized_name text not null,
  display_name text not null,
  role public.lol_role not null,
  rank text,
  opgg_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_key, normalized_name)
);

alter table public.players
  add column canonical_player_id uuid references public.player_pool(id) on delete set null;

alter table public.player_pool enable row level security;

create policy player_pool_public_read on public.player_pool for select using (true);
create policy player_pool_admin_write on public.player_pool for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.player_pool to anon, authenticated;
grant insert, update, delete on public.player_pool to authenticated;
grant all on public.player_pool to service_role;

insert into public.player_pool (
  season_key, normalized_name, display_name, role, rank, opgg_url
)
values
  ('season-5', 'winter', 'Captain: Winter', 'top'::public.lol_role, 'M10', 'https://op.gg/lol/summoners/na/Winter-Ashtn'),
  ('season-5', 'bleedinwolves', 'Captain: Bleedinwolves', 'top'::public.lol_role, 'D2', 'https://op.gg/lol/summoners/na/Bleedinwolves-IlIll'),
  ('season-5', 'kingofspades', 'Captain: KingOfSpades', 'top'::public.lol_role, 'E2', 'https://op.gg/lol/summoners/na/KingOfSpades-205'),
  ('season-5', 'sycoghost', 'Captain: Sycoghost', 'top'::public.lol_role, 'E4', 'https://op.gg/lol/summoners/na/Sycoghost-1402'),
  ('season-5', 'canny', 'Canny#rip', 'top'::public.lol_role, 'M10', 'https://op.gg/lol/summoners/na/Canny-rip'),
  ('season-5', 'killer python', 'Killer Python#NA1', 'top'::public.lol_role, 'D2', 'https://op.gg/lol/summoners/na/Killer%20Python-NA1'),
  ('season-5', 'walt', 'Walt#0001', 'top'::public.lol_role, 'M10', 'https://www.op.gg/multisearch/na?summoners=Walt%230001%2CWalt%230002%2CHi+Walter%23NA1%2CWalt%23NILAH'),
  ('season-5', 'rutledge', 'Rutledge#osu', 'top'::public.lol_role, 'E2', 'https://op.gg/lol/summoners/na/Rutledge-osu'),
  ('season-5', 'themooserules', 'TheMooseRules#NA1', 'top'::public.lol_role, 'D3', 'https://op.gg/lol/summoners/na/TheMooseRules-NA1'),
  ('season-5', 'mmo', 'MMO#NA1', 'top'::public.lol_role, 'D4', 'https://op.gg/lol/multisearch/na?summoners=MMO%23NA1%2Cclash%20of%20clans%23NA1'),
  ('season-5', 'all gucci', 'all gucci#gamer', 'top'::public.lol_role, 'D4', 'https://op.gg/fr/lol/multisearch/na?summoners=all+gucci%23gamer%2C+all+gucci%23na1'),
  ('season-5', 'promech', 'Promech#NA1', 'top'::public.lol_role, 'E3', 'https://op.gg/lol/summoners/na/Promech-NA1'),
  ('season-5', 'wellshowthemall', 'Captain:Wellshowthemall', 'jungle'::public.lol_role, 'D3', 'https://op.gg/lol/multisearch/na?summoners=WellShowThemAll%23NA1%2CRATIRL+TEST+1%23NA1%2Cnormal+jungler%23XDD'),
  ('season-5', 'metashift', 'Captain:Metashift', 'jungle'::public.lol_role, 'D4', 'https://op.gg/lol/summoners/na/Metashift-2281'),
  ('season-5', 'lizzo mukkbang', 'Captain: Lizzo Mukkbang', 'jungle'::public.lol_role, 'E3', 'https://op.gg/lol/summoners/na/Lizzo%20Mukkbang-Mukk'),
  ('season-5', 'pinei nessa poha', 'Pinei nessa poha#00027', 'jungle'::public.lol_role, 'M10', 'https://op.gg/lol/summoners/na/Pinei%20nessa%20poha-00027'),
  ('season-5', 'superbeans', 'Superbeans#222', 'jungle'::public.lol_role, 'D2', 'https://op.gg/fr/lol/summoners/na/Superbeans-222'),
  ('season-5', 'angrodis', 'Angrodis', 'jungle'::public.lol_role, 'D4', 'https://op.gg/lol/summoners/na/Angrodis-NA1'),
  ('season-5', 'crabadabadoo', 'Crabadabadoo', 'jungle'::public.lol_role, 'D4', 'https://op.gg/lol/summoners/na/Crabadabadoo-NA1'),
  ('season-5', 'i fear nobody', 'i fear nobody#na1', 'jungle'::public.lol_role, 'D4', 'https://op.gg/lol/summoners/na/i%20fear%20nobody-na1'),
  ('season-5', 'conguitos', 'Conguitos#01203', 'jungle'::public.lol_role, 'E2', 'https://op.gg/lol/summoners/na/Conguitos-01203'),
  ('season-5', 'deathmasterpwnz2', 'DeathMasterPwnz2#NARC', 'jungle'::public.lol_role, 'E3', 'https://op.gg/lol/summoners/na/DeathMasterPwnz2-NARC'),
  ('season-5', 'sir joey', 'Sir Joey#Valor', 'jungle'::public.lol_role, 'E2', 'https://op.gg/lol/summoners/na/SirJoey-Valor'),
  ('season-5', 'σπαρτιατης', 'ΣΠΑΡΤΙΑΤΗΣ #Sprtn', 'jungle'::public.lol_role, 'E2', 'https://op.gg/lol/summoners/na/%CE%A3%CE%A0%CE%91%CE%A1%CE%A4%CE%99%CE%91%CE%A4%CE%97%CE%A3-Sprtn'),
  ('season-5', 'yrw', 'Captain: YRW', 'mid'::public.lol_role, 'D4', 'https://op.gg/lol/summoners/na/YRW-NA1'),
  ('season-5', 'flying squirtle', 'Captain: Flying Squirtle', 'mid'::public.lol_role, 'D4', 'https://op.gg/lol/summoners/na/Flyinq%20Squirtle-NA1'),
  ('season-5', 'slimpimpin77', 'SlimPimpin77#epic', 'mid'::public.lol_role, 'D1', 'https://op.gg/lol/summoners/na/SlimPimpin77-epic'),
  ('season-5', 'jaydk', 'JayDK#NA1', 'mid'::public.lol_role, 'D3', 'https://op.gg/lol/summoners/na/JayDK-NA1'),
  ('season-5', 'lotusb5', 'LotusB5#999', 'mid'::public.lol_role, 'D2', 'https://op.gg/lol/summoners/na/LotusB5-999'),
  ('season-5', 'zoodiac', 'Zoodiac#すべて同じ', 'mid'::public.lol_role, 'D2', 'https://op.gg/lol/summoners/na/Zoodiac-%E3%81%99%E3%81%B9%E3%81%A6%E5%90%8C%E3%81%98'),
  ('season-5', 'cherrie', 'Cherrie', 'mid'::public.lol_role, 'D4', 'https://op.gg/lol/summoners/na/Cherrie-coke'),
  ('season-5', 'gratxace', 'GratxAce#NA1', 'mid'::public.lol_role, 'D4', 'https://op.gg/lol/summoners/na/GratxAce-NA1'),
  ('season-5', 'solomon', 'solomon#meow', 'mid'::public.lol_role, 'D3', 'https://op.gg/lol/summoners/na/solomon-meow'),
  ('season-5', 'feraleevee', 'FeralEevee#133', 'mid'::public.lol_role, 'E4', 'https://op.gg/lol/summoners/na/FeralEevee-133'),
  ('season-5', 'quetips', 'Quetips#na1', 'mid'::public.lol_role, 'E1', 'https://op.gg/lol/summoners/na/Quetips-na1'),
  ('season-5', 'ywgi', 'YWGI#rain', 'mid'::public.lol_role, 'E1', 'https://op.gg/lol/summoners/na/YWGI-rain'),
  ('season-5', '7gen', 'Captain: 7Gen', 'adc'::public.lol_role, 'D4', 'https://op.gg/lol/summoners/na/7Gen-4444'),
  ('season-5', 'ienders', 'Captain:IEnders', 'adc'::public.lol_role, 'E2', 'https://op.gg/lol/summoners/na/iEnders-jett'),
  ('season-5', 'matrix', 'Matrix#NA101', 'adc'::public.lol_role, 'M90', 'https://op.gg/lol/summoners/na/Matrix-NA101'),
  ('season-5', 'vip peekaboo', 'VIP Peekaboo#VIP', 'adc'::public.lol_role, 'M10', 'https://op.gg/lol/multisearch/na?summoners=VIP+Peekaboo%23VIP%2CToplanegodmn%23NA1%2Czpfngvx%23NA1%2Cfgvunlldw%23NA1'),
  ('season-5', 'dariss', 'Dariss#na1', 'adc'::public.lol_role, 'D4', 'https://op.gg/lol/summoners/na/Dariss-na1'),
  ('season-5', 'thunder master', 'Thunder Master#BLOOD', 'adc'::public.lol_role, 'D3', 'https://op.gg/lol/summoners/na/Thunder%20Master-BLOOD'),
  ('season-5', 'humble', 'Humble#btc', 'adc'::public.lol_role, 'E3', 'https://op.gg/lol/summoners/na/Humble-btc'),
  ('season-5', 'the grip reaper', 'the grip reaper #meow', 'adc'::public.lol_role, 'D4', 'https://op.gg/lol/summoners/na/the%20grip%20reaper-meow'),
  ('season-5', 'nickle', 'Nickle#2537', 'adc'::public.lol_role, 'E3', 'https://op.gg/lol/summoners/na/Nickle-2537'),
  ('season-5', 'imperialarcher', 'Imperialarcher#ezpz', 'adc'::public.lol_role, 'E3', 'https://op.gg/lol/summoners/na/Imperialarcher-ezpz'),
  ('season-5', 'lolcavan', 'Lolcavan#NA1', 'adc'::public.lol_role, 'E3', 'https://op.gg/lol/summoners/na/Lolcavan-NA1'),
  ('season-5', 'seeu', 'SeeU#Xiyue', 'adc'::public.lol_role, 'E2', 'https://op.gg/lol/multisearch/na?summoners=SeeU%23Xiyue%2CBad+AppIe%23NA1'),
  ('season-5', 'spies', 'Captain: Spies', 'support'::public.lol_role, 'D4', 'https://op.gg/lol/summoners/na/Spies-6313'),
  ('season-5', 'aura', 'Aura#5950', 'support'::public.lol_role, 'M10', 'https://op.gg/lol/summoners/na/Aura-5950'),
  ('season-5', 'chief', 'Chief#1160', 'support'::public.lol_role, 'M10', 'https://op.gg/lol/multisearch/na?summoners=chief%231160%2CXericon%231408'),
  ('season-5', 'doug', 'Doug#LIMU', 'support'::public.lol_role, 'D2', 'https://op.gg/lol/multisearch/na?summoners=doug%23limu%2C+master+reigen%23mob%2C'),
  ('season-5', 'qball', 'Qball#1032', 'support'::public.lol_role, 'D2', 'https://op.gg/lol/multisearch/na?summoners=QBall%231032%2C+TBall%232310%2C+JBall%231032%2C'),
  ('season-5', 'beg', 'Beg#DU1', 'support'::public.lol_role, 'D4', 'https://op.gg/lol/summoners/na/Beg-DU1'),
  ('season-5', 'chime', '08 Mitsu Eclipse#Chime', 'support'::public.lol_role, 'D4', 'https://op.gg/lol/summoners/na/08%20Mitsu%20Eclipse-Chime'),
  ('season-5', 'wrathofsath', 'WrathOfSath', 'support'::public.lol_role, 'E1', 'https://op.gg/lol/summoners/na/WrathOfSath-NA1'),
  ('season-5', 'boat chicken', 'Boat chicken#na1', 'support'::public.lol_role, 'E2', 'https://op.gg/lol/multisearch/na?summoners=Boat%20chicken%23na1%2C%20Lance%20steele%23lance'),
  ('season-5', 'i am atomic', 'I am atomic#idk', 'support'::public.lol_role, 'E4', 'https://op.gg/lol/summoners/na/I%20am%20atomic-idk'),
  ('season-5', 'pr1mus', 'Pr1mus#NA1', 'support'::public.lol_role, 'E4', 'https://op.gg/lol/multisearch/na?summoners=Pr1mus%23NA1%2CIWillCrankYou%23hookd'),
  ('season-5', 'unluckycanadian', 'UnluckyCanadian#CDN', 'support'::public.lol_role, 'E3', 'https://op.gg/lol/summoners/na/UnluckyCanadian-CDN')
on conflict (season_key, normalized_name) do nothing;
