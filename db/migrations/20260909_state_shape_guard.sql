begin;

-- The client refuses to open a game whose state fails parseTournament, so a
-- single malformed write used to make a game permanently unopenable on every
-- device. These checks reject that write at the database instead.

create or replace function public.football_jsonb_int_in_range(
  p_value jsonb,
  p_min numeric,
  p_max numeric
)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(p_value) = 'number'
    and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric)
    and (p_value #>> '{}')::numeric between p_min and p_max;
$$;

-- Deliberately a subset of parseTournament in lib/football-schema.ts: only the
-- rules that parser always requires, so a valid client write is never rejected.
create or replace function public.football_state_is_valid(p_state jsonb)
returns boolean
language sql
immutable
as $$
  select
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
    );
$$;

-- NOT VALID so an already-stored row is left alone; every future write is
-- checked. Validate it separately once the existing rows are known to pass.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'football_games_state_shape'
      and conrelid = 'public.football_games'::regclass
  ) then
    alter table public.football_games
      add constraint football_games_state_shape
      check (public.football_state_is_valid(state)) not valid;
  end if;
end $$;

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
    select * into v_row from public.football_games where id = p_game_id;
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

revoke all on function public.create_football_game(jsonb, text) from public;
revoke all on function public.save_football_game_v2(text, jsonb, bigint) from public;
grant execute on function public.create_football_game(jsonb, text) to anonymous;
grant execute on function public.save_football_game_v2(text, jsonb, bigint) to anonymous;

commit;
