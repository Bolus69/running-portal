-- Align this migration with the existing marathon-coach database.
-- Strava upserts need a non-partial conflict arbiter; manual activities may still have NULL IDs.
create unique index if not exists activities_source_external_id_idx
  on public.activities (source, external_activity_id);

-- Cover the remaining foreign keys used by the coach and activity queries.
create index if not exists activity_workout_links_planned_workout_id_idx on public.activity_workout_links (planned_workout_id);
create index if not exists audit_events_actor_id_idx on public.audit_events (actor_id);
create index if not exists audit_events_athlete_id_idx on public.audit_events (athlete_id);
create index if not exists coach_athletes_athlete_id_idx on public.coach_athletes (athlete_id);
create index if not exists coach_changes_athlete_id_idx on public.coach_changes (athlete_id);
create index if not exists coach_changes_coach_id_idx on public.coach_changes (coach_id);
create index if not exists coach_changes_planned_workout_id_idx on public.coach_changes (planned_workout_id);
create index if not exists coach_changes_suggestion_id_idx on public.coach_changes (suggestion_id);
create index if not exists coach_notes_athlete_id_idx on public.coach_notes (athlete_id);
create index if not exists coach_notes_coach_id_idx on public.coach_notes (coach_id);
create index if not exists coach_roles_granted_by_idx on public.coach_roles (granted_by);
create index if not exists coach_suggestions_athlete_id_idx on public.coach_suggestions (athlete_id);
create index if not exists coach_suggestions_coach_id_idx on public.coach_suggestions (coach_id);
create index if not exists coach_suggestions_planned_workout_id_idx on public.coach_suggestions (planned_workout_id);
create index if not exists planned_workouts_plan_id_idx on public.planned_workouts (plan_id);
create index if not exists training_plans_coach_id_idx on public.training_plans (coach_id);
create index if not exists workout_feedback_activity_id_idx on public.workout_feedback (activity_id);
create index if not exists workout_feedback_athlete_id_idx on public.workout_feedback (athlete_id);

-- Keep the project's RLS-enforcement event trigger, but remove public RPC execution grants.
do $migration$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$migration$;
