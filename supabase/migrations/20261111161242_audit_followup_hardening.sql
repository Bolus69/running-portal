-- Audit follow-up: store the athlete's recent training baseline and keep
-- optional wellness sharing private unless the athlete opts in.
alter table public.training_plans
  add column recent_weekly_km numeric(6,2)
    check (recent_weekly_km is null or recent_weekly_km between 0.01 and 300),
  add column recent_longest_run_km numeric(6,2)
    check (recent_longest_run_km is null or recent_longest_run_km between 0.01 and 100);

alter table public.wellness_entries
  alter column visible_to_coach set default false;

-- Store a plan and its sessions in one transaction. A failure leaves the
-- athlete's previous active plan untouched.
create or replace function public.create_training_plan_bundle(
  p_plan jsonb,
  p_weeks jsonb,
  p_workouts jsonb,
  p_steps jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_plan_id uuid := nullif(p_plan ->> 'id', '')::uuid;
  v_athlete_id uuid := nullif(p_plan ->> 'athlete_id', '')::uuid;
begin
  if v_plan_id is null or v_athlete_id is null
    or jsonb_typeof(p_weeks) is distinct from 'array'
    or jsonb_typeof(p_workouts) is distinct from 'array'
    or jsonb_typeof(p_steps) is distinct from 'array'
    or jsonb_typeof(p_plan -> 'training_days') is distinct from 'array'
  then
    raise exception 'Invalid training plan bundle';
  end if;

  -- Serialize plan replacements for the same athlete.
  perform pg_advisory_xact_lock(hashtextextended(v_athlete_id::text, 0));

  insert into public.training_plans (
    id, athlete_id, coach_id, plan_length, marathon_date, goal_time_seconds,
    recent_race_distance_km, recent_race_time_seconds, recent_weekly_km,
    recent_longest_run_km, training_days, has_optional_fourth, training_paces, status
  ) values (
    v_plan_id,
    v_athlete_id,
    nullif(p_plan ->> 'coach_id', '')::uuid,
    (p_plan ->> 'plan_length')::smallint,
    (p_plan ->> 'marathon_date')::date,
    (p_plan ->> 'goal_time_seconds')::integer,
    nullif(p_plan ->> 'recent_race_distance_km', '')::numeric,
    nullif(p_plan ->> 'recent_race_time_seconds', '')::integer,
    nullif(p_plan ->> 'recent_weekly_km', '')::numeric,
    nullif(p_plan ->> 'recent_longest_run_km', '')::numeric,
    array(select value::smallint from jsonb_array_elements_text(p_plan -> 'training_days') as days(value)),
    coalesce((p_plan ->> 'has_optional_fourth')::boolean, false),
    coalesce(p_plan -> 'training_paces', '{}'::jsonb),
    'draft'
  );

  insert into public.plan_weeks (id, plan_id, week_number, phase, goal, is_recovery_week)
  select
    (item ->> 'id')::uuid,
    v_plan_id,
    (item ->> 'week_number')::smallint,
    item ->> 'phase',
    coalesce(item ->> 'goal', ''),
    coalesce((item ->> 'is_recovery_week')::boolean, false)
  from jsonb_array_elements(p_weeks) as weeks(item);

  insert into public.planned_workouts (
    id, plan_id, plan_week_id, athlete_id, workout_order, workout_date,
    workout_type, title, duration_minutes, distance_km, time_cap_minutes,
    intensity, goal, description, state, is_optional
  )
  select
    (item ->> 'id')::uuid,
    v_plan_id,
    (item ->> 'plan_week_id')::uuid,
    v_athlete_id,
    (item ->> 'workout_order')::smallint,
    (item ->> 'workout_date')::date,
    (item ->> 'workout_type')::public.workout_type,
    item ->> 'title',
    nullif(item ->> 'duration_minutes', '')::integer,
    nullif(item ->> 'distance_km', '')::numeric,
    nullif(item ->> 'time_cap_minutes', '')::integer,
    coalesce(item ->> 'intensity', ''),
    coalesce(item ->> 'goal', ''),
    coalesce(item ->> 'description', ''),
    coalesce((item ->> 'state')::public.workout_state, 'planned'::public.workout_state),
    coalesce((item ->> 'is_optional')::boolean, false)
  from jsonb_array_elements(p_workouts) as workouts(item);

  insert into public.workout_steps (
    planned_workout_id, step_order, step_type, label, duration_minutes, repeats, intensity
  )
  select
    (item ->> 'planned_workout_id')::uuid,
    (item ->> 'step_order')::smallint,
    item ->> 'step_type',
    item ->> 'label',
    nullif(item ->> 'duration_minutes', '')::integer,
    nullif(item ->> 'repeats', '')::smallint,
    nullif(item ->> 'intensity', '')
  from jsonb_array_elements(p_steps) as steps(item);

  update public.training_plans
  set status = 'paused', updated_at = now()
  where athlete_id = v_athlete_id and status = 'active';

  update public.training_plans
  set status = 'active', updated_at = now()
  where id = v_plan_id;

  return v_plan_id;
end;
$function$;

revoke all on function public.create_training_plan_bundle(jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_training_plan_bundle(jsonb, jsonb, jsonb, jsonb) to service_role;
