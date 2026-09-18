begin;

-- /latest skips a game the group has ended with "จบเกมวันนี้". The client only
-- reads the list, so the list has to say which games are closed. Additive: a
-- client that predates this ignores the extra field, and a client that has it
-- treats a missing field as open.

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
        'updatedAt', updated_at,
        'closed', coalesce(jsonb_typeof(state -> 'closedAt') = 'string', false)
      )
      order by updated_at desc
    ),
    '[]'::jsonb
  )
  from public.football_games;
$$;

revoke all on function public.list_football_games() from public;
grant execute on function public.list_football_games() to anonymous;

commit;
