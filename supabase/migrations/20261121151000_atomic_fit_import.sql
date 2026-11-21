-- One transaction for activity, laps, link and feedback. No existing data changes.
-- Uses the caller's RLS permissions. Serializes retries per athlete/file.
-- Rollback: deploy the preceding route, then drop this function if needed.
create or replace function public.import_fit_workout(p_workout_id uuid, p_activity jsonb, p_laps jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_catalog
as $function$
declare
  v_athlete_id uuid := auth.uid();
  v_activity_id uuid;
  v_hash text := p_activity -> 'raw_summary' ->> 'upload_hash';
  v_retry boolean := false;
begin
  if v_athlete_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.planned_workouts where id = p_workout_id and athlete_id = v_athlete_id) then
    raise exception 'Workout not owned by athlete' using errcode = '42501';
  end if;
  if v_hash is null or v_hash !~ '^[a-f0-9]{64}$'
    or jsonb_typeof(p_laps) is distinct from 'array'
    or jsonb_array_length(p_laps) > 1000
    or coalesce((p_activity ->> 'elapsed_seconds')::integer, 0) not between 1 and 108000
    or coalesce((p_activity ->> 'moving_seconds')::integer, 0) not between 1 and 108000
    or coalesce((p_activity ->> 'distance_meters')::numeric, 0) not between 0 and 500000
  then
    raise exception 'Invalid FIT summary' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_athlete_id::text || ':fit:' || v_hash, 0));
  select id into v_activity_id from public.activities
    where athlete_id = v_athlete_id and source = 'manual' and raw_summary ->> 'upload_hash' = v_hash
    order by created_at, id limit 1;
  v_retry := v_activity_id is not null;
  if v_retry and exists (select 1 from public.activity_workout_links where activity_id = v_activity_id and planned_workout_id <> p_workout_id) then
    raise exception 'FIT already linked to another workout' using errcode = '23505';
  end if;
  if not v_retry then
    insert into public.activities (
      athlete_id, source, name, activity_type, started_at, elapsed_seconds, moving_seconds,
      distance_meters, average_speed_mps, average_heart_rate, raw_summary
    ) values (
      v_athlete_id, 'manual', 'Hardlooptraining', 'Run', (p_activity ->> 'started_at')::timestamptz,
      (p_activity ->> 'elapsed_seconds')::integer, (p_activity ->> 'moving_seconds')::integer,
      (p_activity ->> 'distance_meters')::numeric, (p_activity ->> 'average_speed_mps')::numeric,
      (p_activity ->> 'average_heart_rate')::numeric,
      jsonb_strip_nulls(jsonb_build_object('import_source','fit','upload_hash',v_hash,
        'effort',p_activity -> 'raw_summary' ->> 'effort','note',left(p_activity -> 'raw_summary' ->> 'note',200)))
    ) returning id into v_activity_id;
  end if;
  insert into public.activity_laps (activity_id, lap_order, label, elapsed_seconds, distance_meters, average_speed_mps, average_heart_rate)
  select v_activity_id, (lap ->> 'lap_order')::smallint, left(lap ->> 'label',50),
    (lap ->> 'elapsed_seconds')::integer, (lap ->> 'distance_meters')::numeric,
    (lap ->> 'average_speed_mps')::numeric, (lap ->> 'average_heart_rate')::numeric
  from jsonb_array_elements(p_laps) as laps(lap)
  on conflict (activity_id, lap_order) do nothing;

  insert into public.activity_workout_links (activity_id, planned_workout_id, match_method, confidence)
    values (v_activity_id, p_workout_id, 'manual', 1)
    on conflict (activity_id, planned_workout_id) do nothing;
  insert into public.workout_feedback (planned_workout_id, athlete_id, activity_id, state, effort, note, completed_at, updated_at)
    values (p_workout_id, v_athlete_id, v_activity_id, 'completed',
      nullif(p_activity -> 'raw_summary' ->> 'effort','')::public.effort_feedback,
      nullif(left(p_activity -> 'raw_summary' ->> 'note',200),''),
      (p_activity ->> 'started_at')::timestamptz, now())
    on conflict (planned_workout_id, athlete_id) do update set
      activity_id = excluded.activity_id, state = excluded.state, effort = excluded.effort,
      note = excluded.note, completed_at = excluded.completed_at, updated_at = now();
  return jsonb_build_object('activityId',v_activity_id,'isRetry',v_retry);
end;
$function$;
revoke all on function public.import_fit_workout(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.import_fit_workout(uuid,jsonb,jsonb) to authenticated;
