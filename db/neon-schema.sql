begin;

create or replace function public.football_jsonb_int_in_range(
  p_value jsonb,
  p_min numeric,
  p_max numeric
)
returns boolean
language sql
immutable
as $$
  -- A missing key reads as SQL NULL, and a CHECK constraint accepts NULL, so
  -- every branch has to resolve to a definite true or false.
  select coalesce(
    jsonb_typeof(p_value) = 'number'
      and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric)
      and (p_value #>> '{}')::numeric between p_min and p_max,
    false
  );
$$;

-- The client refuses to open a game whose state fails parseTournament, so an
-- unchecked malformed write would make a game permanently unopenable on every
-- device. Deliberately a subset of parseTournament in lib/football-schema.ts:
-- only the rules that parser always requires, so a valid write is never
-- rejected.
create or replace function public.football_state_is_valid(p_state jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(
    jsonb_typeof(p_state) = 'object'
    and jsonb_typeof(p_state -> 'id') = 'string'
    and jsonb_typeof(p_state -> 'name') = 'string'
    and jsonb_typeof(p_state -> 'createdAt') = 'string'
    and jsonb_typeof(p_state -> 'startTime') = 'string'
    and (p_state ->> 'startTime') ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
    and p_state -> 'numberOfFields' = '1'::jsonb
    and public.football_jsonb_int_in_range(
      p_state -> 'matchDurationMinutes', 1, 180
    )
    and public.football_jsonb_int_in_range(
      p_state -> 'breakDurationMinutes', 0, 60
    )
    and public.football_jsonb_int_in_range(
      p_state -> 'availableTimeMinutes', 1, 1440
    )
    and jsonb_typeof(p_state -> 'matches') = 'array'
    and jsonb_typeof(p_state -> 'teams') = 'array'
    and jsonb_array_length(p_state -> 'teams') between 2 and 8
    and not exists (
      select 1
      from jsonb_array_elements(p_state -> 'teams') team
      where jsonb_typeof(team) is distinct from 'object'
         or jsonb_typeof(team -> 'id') is distinct from 'string'
         or length(team ->> 'id') = 0
         or jsonb_typeof(team -> 'name') is distinct from 'string'
         or jsonb_typeof(team -> 'players') is distinct from 'array'
         or jsonb_typeof(team -> 'gkRotation') is distinct from 'array'
         or jsonb_typeof(team -> 'gkCycleOrders') is distinct from 'array'
    )
    and (
      select count(distinct team ->> 'id')
      from jsonb_array_elements(p_state -> 'teams') team
    ) = jsonb_array_length(p_state -> 'teams')
    and not exists (
      select 1
      from jsonb_array_elements(p_state -> 'matches') match
      where jsonb_typeof(match) is distinct from 'object'
         or jsonb_typeof(match -> 'id') is distinct from 'string'
         or length(match ->> 'id') = 0
    ),
    false
  );
$$;

create table if not exists public.football_games (
  id text primary key,
  state jsonb not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint football_games_id_format
    check (id ~ '^game[0-9]{8}-[1-9][0-9]*$'),
  constraint football_games_state_object
    check (jsonb_typeof(state) = 'object'),
  constraint football_games_state_shape
    check (public.football_state_is_valid(state))
);

revoke all on table public.football_games from public;
revoke all on table public.football_games from anonymous;
revoke all on table public.football_games from authenticated;

drop function if exists public.save_football_game(text, jsonb);

create or replace function public.create_football_game(
  p_state jsonb,
  p_date_code text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_number integer;
  v_game_id text;
  v_state jsonb;
  v_row public.football_games%rowtype;
begin
  if p_date_code !~ '^[0-9]{8}$' then
    raise exception 'invalid date code' using errcode = '22023';
  end if;

  if jsonb_typeof(p_state) is distinct from 'object' then
    raise exception 'state must be a JSON object' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('football-game-' || p_date_code));

  select coalesce(max(substring(id from '-([0-9]+)$')::integer), 0) + 1
    into v_number
    from public.football_games
   where id like 'game' || p_date_code || '-%';

  v_game_id := 'game' || p_date_code || '-' || v_number;
  v_state := jsonb_set(p_state, '{id}', to_jsonb(v_game_id), true);

  if not public.football_state_is_valid(v_state) then
    raise exception 'state is not a valid tournament' using errcode = '22023';
  end if;

  insert into public.football_games (id, state)
  values (v_game_id, v_state)
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'state', v_row.state,
    'revision', v_row.revision,
    'updatedAt', v_row.updated_at
  );
end;
$$;

create or replace function public.get_football_game(p_game_id text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', id,
    'state', state,
    'revision', revision,
    'updatedAt', updated_at
  )
  from public.football_games
  where id = p_game_id
    and p_game_id ~ '^game[0-9]{8}-[1-9][0-9]*$';
$$;

-- Optimistic-locking version used by the web app. A stale browser receives the
-- latest row instead of silently overwriting changes made on another device.
create or replace function public.save_football_game_v2(
  p_game_id text,
  p_state jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.football_games%rowtype;
  v_state jsonb;
  v_conflict boolean := false;
begin
  if p_game_id !~ '^game[0-9]{8}-[1-9][0-9]*$' then
    raise exception 'invalid game id' using errcode = '22023';
  end if;

  if jsonb_typeof(p_state) is distinct from 'object' then
    raise exception 'state must be a JSON object' using errcode = '22023';
  end if;

  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'expected revision must be positive' using errcode = '22023';
  end if;

  v_state := jsonb_set(p_state, '{id}', to_jsonb(p_game_id), true);

  if not public.football_state_is_valid(v_state) then
    raise exception 'state is not a valid tournament' using errcode = '22023';
  end if;

  update public.football_games
     set state = v_state,
         revision = revision + 1,
         updated_at = now()
   where id = p_game_id
     and revision = p_expected_revision
  returning * into v_row;

  if not found then
    select * into v_row
      from public.football_games
     where id = p_game_id;
    if not found then
      raise exception 'game not found' using errcode = 'P0002';
    end if;
    v_conflict := true;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'state', v_row.state,
    'revision', v_row.revision,
    'updatedAt', v_row.updated_at,
    'conflict', v_conflict
  );
end;
$$;

create or replace function public.list_football_games()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', coalesce(state ->> 'name', id),
        'teamCount', coalesce(jsonb_array_length(state -> 'teams'), 0),
        'matchCount', coalesce(jsonb_array_length(state -> 'matches'), 0),
        'finishedCount', coalesce(
          (
            select count(*)
            from jsonb_array_elements(coalesce(state -> 'matches', '[]'::jsonb)) match
            where match ->> 'status' = 'finished'
          ),
          0
        ),
        'startTime', coalesce(state ->> 'startTime', ''),
        'createdAt', created_at,
        'updatedAt', updated_at
      )
      order by updated_at desc
    ),
    '[]'::jsonb
  )
  from public.football_games;
$$;

create or replace function public.delete_football_game(p_game_id text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted boolean;
begin
  if p_game_id !~ '^game[0-9]{8}-[1-9][0-9]*$' then
    raise exception 'invalid game id' using errcode = '22023';
  end if;

  delete from public.football_games where id = p_game_id;
  v_deleted := found;
  return v_deleted;
end;
$$;

revoke all on function public.create_football_game(jsonb, text) from public;
revoke all on function public.get_football_game(text) from public;
revoke all on function public.save_football_game_v2(text, jsonb, bigint) from public;
revoke all on function public.list_football_games() from public;
revoke all on function public.delete_football_game(text) from public;

grant usage on schema public to anonymous;
grant execute on function public.create_football_game(jsonb, text) to anonymous;
grant execute on function public.get_football_game(text) to anonymous;
grant execute on function public.save_football_game_v2(text, jsonb, bigint) to anonymous;
grant execute on function public.list_football_games() to anonymous;
grant execute on function public.delete_football_game(text) to anonymous;

commit;
