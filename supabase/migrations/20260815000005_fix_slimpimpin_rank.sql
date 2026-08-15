with canonical_player as (
  select id
  from public.player_pool
  where season_key = 'season-5'
    and normalized_name = 'slimpimpin77'
)
update public.player_pool as pp
set rank = 'D1'
from canonical_player as cp
where pp.id = cp.id
  and pp.rank is distinct from 'D1';

with canonical_player as (
  select id
  from public.player_pool
  where season_key = 'season-5'
    and normalized_name = 'slimpimpin77'
)
update public.players as p
set rank = 'D1'
from canonical_player as cp
where p.canonical_player_id = cp.id
  and p.rank is distinct from 'D1';
