-- Apply after neon-schema.sql. No existing game state/score/fixture is rewritten.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.football_games in share row exclusive mode;

create temporary table football_hardening_before on commit drop as
select md5(coalesce(jsonb_agg(jsonb_build_array(id, revision, state, created_at, updated_at) order by id)::text, '[]')) signature
from public.football_games;

create or replace function public.football_jsonb_int_in_range(p_value jsonb, p_min numeric, p_max numeric)
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
begin
  if jsonb_typeof(p_value) is distinct from 'number' then return false; end if;
  return (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric)
    and (p_value #>> '{}')::numeric between p_min and p_max;
end;
$$;

create or replace function public.football_string_fields(p_value jsonb, p_required text[], p_optional text[])
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
declare k text;
begin
  if jsonb_typeof(p_value) is distinct from 'object' then return false; end if;
  foreach k in array p_required loop
    if jsonb_typeof(p_value -> k) is distinct from 'string' then return false; end if;
  end loop;
  foreach k in array p_optional loop
    if p_value ? k and jsonb_typeof(p_value -> k) is distinct from 'string' then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.football_string_array(p_value jsonb, p_allowed text[], p_unique boolean)
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
declare v jsonb; seen text[] := '{}'; s text;
begin
  if jsonb_typeof(p_value) is distinct from 'array' then return false; end if;
  for v in select value from jsonb_array_elements(p_value) loop
    if jsonb_typeof(v) is distinct from 'string' then return false; end if;
    s := v #>> '{}';
    if p_allowed is not null and not (s = any(p_allowed)) then return false; end if;
    if p_unique and s = any(seen) then return false; end if;
    seen := array_append(seen, s);
  end loop;
  return true;
end;
$$;

-- JavaScript string length counts supplementary Unicode characters twice.
create or replace function public.football_js_length(p_value text)
returns integer language sql immutable set search_path = pg_catalog, public as $$
  select coalesce(sum(case when ascii(ch) > 65535 then 2 else 1 end), 0)::integer
  from regexp_split_to_table(p_value, '') ch;
$$;

create or replace function public.football_point_is_valid(p_value jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
begin
  if jsonb_typeof(p_value) is distinct from 'object'
    or jsonb_typeof(p_value -> 'x') is distinct from 'number'
    or jsonb_typeof(p_value -> 'y') is distinct from 'number' then return false; end if;
  return (p_value ->> 'x')::numeric between 0 and 100 and (p_value ->> 'y')::numeric between 0 and 100;
end;
$$;

create or replace function public.football_markers_are_valid(p_value jsonb, p_teams text[])
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
declare v jsonb; ids text[] := '{}'; balls integer := 0;
begin
  if jsonb_typeof(p_value) is distinct from 'array' then return false; end if;
  for v in select value from jsonb_array_elements(p_value) loop
    if not public.football_string_fields(v, array['id','kind','label'], array['teamId','playerId'])
      or v ->> 'id' = '' or v ->> 'id' = any(ids)
      or not (v ->> 'kind' = any(array['player','ball']))
      or not public.football_point_is_valid(v) then return false; end if;
    if v ? 'teamId' and not (v ->> 'teamId' = any(p_teams)) then return false; end if;
    if v ->> 'kind' = 'player' and not (v ? 'teamId') then return false; end if;
    if v ->> 'kind' = 'ball' then balls := balls + 1; end if;
    ids := array_append(ids, v ->> 'id');
  end loop;
  return balls = 1;
end;
$$;

create or replace function public.football_tactics_is_valid(p_value jsonb, p_teams text[])
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
declare board_teams text[]; k text; step jsonb; path jsonb;
  formations text[] := array['auto','1-2-2','1-1-2-1','1-2-1-1','1-3-2','1-2-3','1-2-2-1','1-1-3-1','1-3-1-1','1-3-3','1-2-4','1-3-2-1','1-2-3-1','1-2-2-2','1-4-1-1'];
begin
  if not public.football_string_fields(p_value, array['teamAId','teamBId','notes'], array['matchId','teamAGkPlayerId','teamBGkPlayerId','teamAFormation','teamBFormation']) then return false; end if;
  board_teams := array[p_value ->> 'teamAId', p_value ->> 'teamBId'];
  if board_teams[1] = board_teams[2] or not (board_teams <@ p_teams)
    or (p_value ? 'matchId' and p_value ->> 'matchId' = '')
    or not public.football_markers_are_valid(p_value -> 'markers', board_teams) then return false; end if;
  if p_value ? 'playerCount' then
    if jsonb_typeof(p_value -> 'playerCount') not in ('number','string') then return false; end if;
    if not ((p_value ->> 'playerCount')::numeric = any(array[5,6,7]::numeric[])) then return false; end if;
  end if;
  foreach k in array array['teamAFormation','teamBFormation'] loop
    if p_value ? k and not (p_value ->> k = any(formations)) then return false; end if;
  end loop;
  if p_value ? 'animationSteps' then
    if jsonb_typeof(p_value -> 'animationSteps') is distinct from 'array' then return false; end if;
    if jsonb_array_length(p_value -> 'animationSteps') not between 1 and 8 then return false; end if;
    for step in select value from jsonb_array_elements(p_value -> 'animationSteps') loop
      if not public.football_string_fields(step, array['id','title'], '{}') or step ->> 'id' = ''
        or public.football_js_length(step ->> 'title') > 40
        or not public.football_markers_are_valid(step -> 'markers', board_teams)
        or jsonb_typeof(step -> 'paths') is distinct from 'array' then return false; end if;
      for path in select value from jsonb_array_elements(step -> 'paths') loop
        if not public.football_string_fields(path, array['id','kind'], '{}') or path ->> 'id' = ''
          or not (path ->> 'kind' = any(array['run','pass']))
          or not public.football_point_is_valid(path -> 'from')
          or not public.football_point_is_valid(path -> 'to') then return false; end if;
      end loop;
    end loop;
  end if;
  return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end;
$$;

-- Validate what parseTournament requires, while retaining legacy names,
-- duplicate shirt colours, stale GK/player references, and optional fields.
create or replace function public.football_state_is_valid(p_state jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
declare team jsonb; player jsonb; cycle jsonb; m jsonb; scorer jsonb; k text;
  teams text[] := '{}'; players text[]; matches text[] := '{}'; scorers text[];
  time_pattern text := '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$';
begin
  if not public.football_string_fields(p_state, array['id','name','createdAt','startTime'], array['closedAt'])
    or p_state -> 'numberOfFields' is distinct from '1'::jsonb
    or not public.football_jsonb_int_in_range(p_state -> 'matchDurationMinutes', 1, 180)
    or not public.football_jsonb_int_in_range(p_state -> 'breakDurationMinutes', 0, 60)
    or not public.football_jsonb_int_in_range(p_state -> 'availableTimeMinutes', 1, 1440)
    or not (p_state ->> 'startTime' ~ time_pattern)
    or jsonb_typeof(p_state -> 'teams') is distinct from 'array'
    or jsonb_typeof(p_state -> 'matches') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_state -> 'teams') not between 2 and 8 then return false; end if;
  for team in select value from jsonb_array_elements(p_state -> 'teams') loop
    if not public.football_string_fields(team, array['id','name','color'], '{}')
      or team ->> 'id' = '' or team ->> 'id' = any(teams)
      or not (team ->> 'color' = any(array['green','red','blue','yellow','white','black','orange','purple']))
      or jsonb_typeof(team -> 'players') is distinct from 'array'
      or jsonb_typeof(team -> 'gkCycleOrders') is distinct from 'array'
      or (team ? 'gkRotationLocked' and jsonb_typeof(team -> 'gkRotationLocked') is distinct from 'boolean') then return false; end if;
    teams := array_append(teams, team ->> 'id');
    players := '{}';
    for player in select value from jsonb_array_elements(team -> 'players') loop
      if not public.football_string_fields(player, array['id','name'], '{}')
        or player ->> 'id' = '' or player ->> 'id' = any(players)
        or jsonb_typeof(player -> 'absentToday') is distinct from 'boolean' then return false; end if;
      if player ? 'positions' and not public.football_string_array(player -> 'positions', array['defender','midfielder','winger','forward','goalkeeper'], true) then return false; end if;
      players := array_append(players, player ->> 'id');
    end loop;
    if not public.football_string_array(team -> 'gkRotation', players, false) then return false; end if;
    for cycle in select value from jsonb_array_elements(team -> 'gkCycleOrders') loop
      if not public.football_string_array(cycle, players, false) then return false; end if;
    end loop;
  end loop;
  for m in select value from jsonb_array_elements(p_state -> 'matches') loop
    if not public.football_string_fields(m, array['id','teamAId','teamBId','startTime','status'], array['teamAGkPlayerId','teamBGkPlayerId'])
      or m ->> 'id' = '' or m ->> 'id' = any(matches)
      or not public.football_jsonb_int_in_range(m -> 'matchNumber', 1, 10000)
      or not public.football_jsonb_int_in_range(m -> 'roundNumber', 1, 10000)
      or m ->> 'teamAId' = m ->> 'teamBId'
      or not (m ->> 'teamAId' = any(teams)) or not (m ->> 'teamBId' = any(teams))
      or not (m ->> 'startTime' ~ time_pattern)
      or not (m ->> 'status' = any(array['upcoming','current','finished'])) then return false; end if;
    matches := array_append(matches, m ->> 'id');
    if m ? 'teamAScore' or m ? 'teamBScore' then
      if not public.football_jsonb_int_in_range(m -> 'teamAScore', 0, 99)
        or not public.football_jsonb_int_in_range(m -> 'teamBScore', 0, 99) then return false; end if;
    end if;
    if m ? 'scorers' then
      if jsonb_typeof(m -> 'scorers') is distinct from 'array' then return false; end if;
      if jsonb_array_length(m -> 'scorers') > 100 then return false; end if;
      scorers := '{}';
      for scorer in select value from jsonb_array_elements(m -> 'scorers') loop
        if not public.football_string_fields(scorer, array['id','teamId','playerName'], array['playerId'])
          or scorer ->> 'id' = '' or scorer ->> 'id' = any(scorers)
          or not (scorer ->> 'teamId' = any(array[m ->> 'teamAId', m ->> 'teamBId']))
          or length(btrim(scorer ->> 'playerName', U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) = 0
          or public.football_js_length(scorer ->> 'playerName') > 60
          or not public.football_jsonb_int_in_range(scorer -> 'goals', 1, 99) then return false; end if;
        scorers := array_append(scorers, scorer ->> 'id');
      end loop;
    end if;
  end loop;
  if p_state ? 'tactics' and not public.football_tactics_is_valid(p_state -> 'tactics', teams) then return false; end if;
  return true;
end;
$$;

-- Recheck old rows first. Any incompatible row aborts the whole transaction;
-- no attempt is made to "repair" it or regenerate its schedule.
do $$
declare invalid_ids text;
begin
  select string_agg(id, ', ' order by id) into invalid_ids
  from public.football_games where not public.football_state_is_valid(state);
  if invalid_ids is not null then raise exception 'Existing games fail validation: %', invalid_ids; end if;
end;
$$;
alter table public.football_games drop constraint if exists football_games_state_shape;
alter table public.football_games add constraint football_games_state_shape check (public.football_state_is_valid(state));

create table if not exists public.football_game_counters (
  date_code text primary key check (date_code ~ '^[0-9]{8}$'),
  last_number bigint not null check (last_number >= 1)
);
revoke all on public.football_game_counters from public, anonymous, authenticated;
insert into public.football_game_counters(date_code, last_number)
select substring(id from 5 for 8), max(substring(id from '-([0-9]+)$')::bigint)
from public.football_games group by substring(id from 5 for 8)
on conflict (date_code) do update set last_number = greatest(football_game_counters.last_number, excluded.last_number);

-- Also remember deleted/manual-imported IDs, not just IDs allocated by the RPC.
create or replace function public.football_remember_game_id()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare game_id text;
begin
  game_id := case when tg_op = 'DELETE' then old.id else new.id end;
  insert into public.football_game_counters(date_code, last_number)
  values (substring(game_id from 5 for 8), substring(game_id from '-([0-9]+)$')::bigint)
  on conflict (date_code) do update set last_number = greatest(football_game_counters.last_number, excluded.last_number);
  return null;
end;
$$;
drop trigger if exists football_remember_game_id on public.football_games;
create trigger football_remember_game_id after insert or delete on public.football_games
for each row execute function public.football_remember_game_id();

create or replace function public.create_football_game(p_state jsonb, p_date_code text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare v_number bigint; v_game_id text; v_state jsonb; v_row public.football_games%rowtype;
begin
  if p_date_code is null or p_date_code !~ '^[0-9]{8}$' then
    raise exception 'invalid date code' using errcode = '22023'; end if;
  if jsonb_typeof(p_state) is distinct from 'object' then
    raise exception 'state must be a JSON object' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('football-game-' || p_date_code));
  insert into public.football_game_counters(date_code, last_number) values (p_date_code, 1)
  on conflict (date_code) do update set last_number = football_game_counters.last_number + 1
  returning last_number into v_number;
  v_game_id := 'game' || p_date_code || '-' || v_number;
  v_state := jsonb_set(p_state, '{id}', to_jsonb(v_game_id), true);
  if not public.football_state_is_valid(v_state) then
    raise exception 'state is not a valid tournament' using errcode = '22023'; end if;
  insert into public.football_games(id, state) values (v_game_id, v_state) returning * into v_row;
  return jsonb_build_object('id', v_row.id, 'state', v_row.state, 'revision', v_row.revision, 'updatedAt', v_row.updated_at);
end;
$$;

revoke all on function public.football_jsonb_int_in_range(jsonb,numeric,numeric), public.football_string_fields(jsonb,text[],text[]),
  public.football_string_array(jsonb,text[],boolean), public.football_js_length(text), public.football_point_is_valid(jsonb),
  public.football_markers_are_valid(jsonb,text[]), public.football_tactics_is_valid(jsonb,text[]),
  public.football_state_is_valid(jsonb), public.football_remember_game_id() from public, anonymous, authenticated;
revoke all on function public.create_football_game(jsonb,text) from public;
grant execute on function public.create_football_game(jsonb,text) to anonymous;

do $$
declare after_signature text;
begin
  select md5(coalesce(jsonb_agg(jsonb_build_array(id, revision, state, created_at, updated_at) order by id)::text, '[]'))
  into after_signature from public.football_games;
  if after_signature is distinct from (select signature from football_hardening_before) then
    raise exception 'Migration changed existing game records'; end if;
end;
$$;
commit;
