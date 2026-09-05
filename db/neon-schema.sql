begin;

create table if not exists public.football_games (
  id text primary key,
  state jsonb not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint football_games_id_format
    check (id ~ '^game[0-9]{8}-[1-9][0-9]*$'),
  constraint football_games_state_object
    check (jsonb_typeof(state) = 'object')
);

revoke all on table public.football_games from public;
revoke all on table public.football_games from anonymous;
revoke all on table public.football_games from authenticated;

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

create or replace function public.save_football_game(
  p_game_id text,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_row public.football_games%rowtype;
begin
  if p_game_id !~ '^game[0-9]{8}-[1-9][0-9]*$' then
    raise exception 'invalid game id' using errcode = '22023';
  end if;

  if jsonb_typeof(p_state) is distinct from 'object' then
    raise exception 'state must be a JSON object' using errcode = '22023';
  end if;

  update public.football_games
     set state = jsonb_set(p_state, '{id}', to_jsonb(p_game_id), true),
         revision = revision + 1,
         updated_at = now()
   where id = p_game_id
  returning * into v_row;

  if not found then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'state', v_row.state,
    'revision', v_row.revision,
    'updatedAt', v_row.updated_at
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
revoke all on function public.save_football_game(text, jsonb) from public;
revoke all on function public.list_football_games() from public;
revoke all on function public.delete_football_game(text) from public;

grant usage on schema public to anonymous;
grant execute on function public.create_football_game(jsonb, text) to anonymous;
grant execute on function public.get_football_game(text) to anonymous;
grant execute on function public.save_football_game(text, jsonb) to anonymous;
grant execute on function public.list_football_games() to anonymous;
grant execute on function public.delete_football_game(text) to anonymous;

commit;
