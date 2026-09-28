-- A request UUID identifies one durable Season's End purchase intent across
-- accounts. Serialize globally by request UUID so a copied or replayed id
-- cannot create a second opening under another member's Discord identity.
create or replace function public.begin_season_end_opening(
  p_request_id uuid,
  p_user text,
  p_release uuid,
  p_mode text
)
returns table(
  opening_id uuid,
  status text,
  price bigint,
  mode text,
  test_balance bigint,
  outcome jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.season_end_openings%rowtype;
  v_release public.season_end_releases%rowtype;
  v_wallet public.season_end_test_wallets%rowtype;
  v_pack_open bigint;
  v_request_count integer;
begin
  if p_request_id is null or p_mode not in ('admin_test', 'public') then
    raise exception 'invalid Season''s End opening input';
  end if;

  -- The key is global because the account identity is part of the receipt.
  -- The old per-user lock allowed the same UUID to be charged once per user.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

  select count(*) into v_request_count
    from public.season_end_openings
   where request_id = p_request_id;
  if v_request_count > 1 then
    raise exception 'request id is already used by multiple accounts';
  elsif v_request_count = 1 then
    select * into v_existing from public.season_end_openings
     where request_id = p_request_id for update;
    if v_existing.discord_id is distinct from p_user then
      raise exception 'request id belongs to another user';
    end if;
    if v_existing.release_id <> p_release or v_existing.mode <> p_mode then
      raise exception 'request id was already used for another Season''s End product';
    end if;
    return query select v_existing.opening_id, v_existing.status, v_existing.price,
      v_existing.mode, v_existing.test_balance_after, v_existing.outcome;
    return;
  end if;

  select * into v_release from public.season_end_releases where id = p_release for update;
  if not found then raise exception 'unknown Season''s End release'; end if;
  if v_release.paused then raise exception 'Season''s End release is paused'; end if;
  if v_release.state not in ('admin_test', 'public') or v_release.catalog_hash = '' or v_release.revision_digest = '' then
    raise exception 'Season''s End release is not locked';
  end if;
  if p_mode = 'public' and v_release.state <> 'public' then
    raise exception 'Season''s End release is not public';
  end if;
  if p_mode = 'admin_test' and v_release.state <> 'admin_test' then
    raise exception 'Season''s End release is not in admin test mode';
  end if;

  if p_mode = 'admin_test' then
    insert into public.season_end_test_wallets (release_id, discord_id)
      values (v_release.id, p_user) on conflict (release_id, discord_id) do nothing;
    select * into v_wallet from public.season_end_test_wallets
     where release_id = v_release.id and discord_id = p_user for update;
    if v_wallet.balance < v_release.price then
      raise exception 'insufficient Season''s End test balance';
    end if;
    update public.season_end_test_wallets
       set balance = balance - v_release.price, updated_at = now()
     where release_id = v_release.id and discord_id = p_user;
  else
    v_pack_open := public.open_card_pack(p_user, v_release.season, v_release.price);
  end if;

  insert into public.season_end_openings
    (request_id, discord_id, release_id, mode, price, pack_open_id, test_balance_after,
     revision_digest, economy_version, economy_payload, signing_book, rules_version)
  values
    (p_request_id, p_user, v_release.id, p_mode, v_release.price, v_pack_open,
     case when p_mode = 'admin_test' then v_wallet.balance - v_release.price end,
     v_release.revision_digest, v_release.economy_version, v_release.economy_payload,
     v_release.signing_book, v_release.rules_version)
  returning season_end_openings.opening_id into opening_id;

  status := 'pending';
  price := v_release.price;
  mode := p_mode;
  test_balance := case when p_mode = 'admin_test' then v_wallet.balance - v_release.price end;
  outcome := null;
  return next;
end;
$$;
