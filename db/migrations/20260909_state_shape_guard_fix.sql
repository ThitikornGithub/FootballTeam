begin;

-- 20260909_state_shape_guard shipped these returning NULL instead of false for
-- a state with missing keys: jsonb_typeof of a missing key is NULL, and the
-- AND-chain propagates it. A CHECK constraint accepts NULL and `if not NULL`
-- never fires, so the guard passed exactly the malformed writes it was added
-- to reject. Both functions now resolve to a definite boolean.

create or replace function public.football_jsonb_int_in_range(
  p_value jsonb,
  p_min numeric,
  p_max numeric
)
returns boolean
language sql
immutable
as $$
  select coalesce(
    jsonb_typeof(p_value) = 'number'
      and (p_value #>> '{}')::numeric = trunc((p_value #>> '{}')::numeric)
      and (p_value #>> '{}')::numeric between p_min and p_max,
    false
  );
$$;

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

-- The tightened rules must not lock an existing game out of saving. Aborting
-- here rolls the whole migration back and leaves the looser guard in place.
do $$
declare
  v_invalid text;
begin
  select string_agg(id, ', ')
    into v_invalid
    from public.football_games
   where not public.football_state_is_valid(state);
  if v_invalid is not null then
    raise exception 'stored games would fail the tightened guard: %', v_invalid;
  end if;
end $$;

commit;
