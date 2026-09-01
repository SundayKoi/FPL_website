-- Keep every schedule-linked market's lock contract consistent, including
-- using a unique migration version that cannot collide with foil types.
-- canceled historical rows that the generator still validates on retries.
update public.betting_markets
   set lock_at = game_at
 where fixture_id is not null
   and lock_at is distinct from game_at;
