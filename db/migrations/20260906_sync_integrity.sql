begin;

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

  update public.football_games
     set state = jsonb_set(p_state, '{id}', to_jsonb(p_game_id), true),
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

revoke all on function public.save_football_game_v2(text, jsonb, bigint) from public;
grant execute on function public.save_football_game_v2(text, jsonb, bigint) to anonymous;

commit;
