-- Additive rollout: old tabs keep their existing create RPC. New clients use
-- v2 with the draft identity, so an uncertain result can safely be retried.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.football_games in share row exclusive mode;

create temporary table football_create_before on commit drop as
select md5(coalesce(jsonb_agg(jsonb_build_array(id, revision, state, created_at, updated_at) order by id)::text, '[]')) signature
from public.football_games;

-- Keep this small receipt after a game is deleted. Replaying that request
-- must report "deleted", never resurrect it or consume another game number.
-- Deliberately no FK/ON DELETE CASCADE and no duplicate snapshot of game data.
create table if not exists public.football_game_create_requests (
  request_id text primary key check (length(request_id) between 1 and 200),
  game_id text not null unique check (game_id ~ '^game[0-9]{8}-[1-9][0-9]*$'),
  created_at timestamptz not null default now()
);
revoke all on public.football_game_create_requests from public, anonymous, authenticated;

create or replace function public.create_football_game_v2(p_state jsonb, p_date_code text, p_request_id text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_game_id text; v_game jsonb;
begin
  if p_request_id is null or length(p_request_id) not between 1 and 200 or btrim(p_request_id) = '' then
    raise exception 'invalid create request id' using errcode = '22023'; end if;
  if p_date_code is null or p_date_code !~ '^[0-9]{8}$' then
    raise exception 'invalid date code' using errcode = '22023'; end if;
  -- Different request IDs still use the original allocator's date lock.
  -- The request lock is acquired first and held until the transaction ends.
  perform pg_advisory_xact_lock(hashtextextended('football-create-request:' || p_request_id, 0));
  select game_id into v_game_id from public.football_game_create_requests where request_id = p_request_id;
  if found then
    v_game := public.get_football_game(v_game_id);
    if v_game is null then raise exception 'game from this create request was deleted' using errcode = 'P0002'; end if;
    -- Return the latest revision, never overwrite later edits with a retry's
    -- payload. The client settles any local edits using the normal CAS path.
    return v_game;
  end if;
  v_game := public.create_football_game(p_state, p_date_code);
  insert into public.football_game_create_requests(request_id, game_id) values (p_request_id, v_game ->> 'id');
  -- The game, counter and receipt commit/rollback together.
  return v_game;
end;
$$;
revoke all on function public.create_football_game_v2(jsonb,text,text) from public, anonymous, authenticated;
grant execute on function public.create_football_game_v2(jsonb,text,text) to anonymous;

do $$
declare after_signature text;
begin
  select md5(coalesce(jsonb_agg(jsonb_build_array(id, revision, state, created_at, updated_at) order by id)::text, '[]'))
  into after_signature from public.football_games;
  if after_signature is distinct from (select signature from football_create_before) then
    raise exception 'Migration changed existing game records'; end if;
end;
$$;
notify pgrst, 'reload schema';
commit;
