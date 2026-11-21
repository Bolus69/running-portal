-- Marathon Coach MVP schema.
-- This migration only creates new objects; it does not alter or remove existing data.

create type public.app_role as enum ('athlete', 'coach');
create type public.plan_status as enum ('draft', 'active', 'completed', 'paused');
create type public.workout_type as enum ('easy', 'quality', 'long', 'optional', 'race');
create type public.workout_state as enum ('planned', 'adjusted', 'skipped');
create type public.activity_source as enum ('manual', 'strava');
create type public.effort_feedback as enum ('easier', 'as_expected', 'harder', 'not_good');
create type public.suggestion_state as enum ('pending', 'accepted', 'modified', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'athlete',
  avatar_url text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Coach roles are granted by an administrator or the server invite route.
create table public.coach_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.coach_athletes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  unique (coach_id, athlete_id),
  check (coach_id <> athlete_id)
);

create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  coach_id uuid references public.profiles(id) on delete set null,
  plan_length smallint not null check (plan_length in (12, 16, 20)),
  marathon_date date not null,
  goal_time_seconds integer not null check (goal_time_seconds between 7200 and 86400),
  recent_race_distance_km numeric(6,2),
  recent_race_time_seconds integer,
  training_days smallint[] not null default array[2,4,0]::smallint[],
  has_optional_fourth boolean not null default false,
  training_paces jsonb not null default '{}'::jsonb,
  status public.plan_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(training_days) = 3),
  check (array_length(training_days, 1) = 3),
  check (training_days <@ array[0,1,2,3,4,5,6]::smallint[]),
  check (training_days[1] <> training_days[2] and training_days[1] <> training_days[3] and training_days[2] <> training_days[3])
);

create index training_plans_athlete_status_idx on public.training_plans (athlete_id, status);

create table public.plan_weeks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 20),
  phase text not null check (phase in ('basis', 'ontwikkeling', 'marathonspecifiek', 'taper')),
  goal text not null default '',
  is_recovery_week boolean not null default false,
  created_at timestamptz not null default now(),
  unique (plan_id, week_number)
);

create table public.planned_workouts (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  plan_week_id uuid not null references public.plan_weeks(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  workout_order smallint not null check (workout_order between 1 and 4),
  workout_date date not null,
  workout_type public.workout_type not null,
  title text not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  distance_km numeric(6,2) check (distance_km is null or distance_km > 0),
  time_cap_minutes integer check (time_cap_minutes is null or time_cap_minutes > 0),
  intensity text not null default '',
  goal text not null default '',
  description text not null default '',
  state public.workout_state not null default 'planned',
  is_optional boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_week_id, workout_order)
);

create index planned_workouts_athlete_date_idx on public.planned_workouts (athlete_id, workout_date desc);

create table public.workout_steps (
  id uuid primary key default gen_random_uuid(),
  planned_workout_id uuid not null references public.planned_workouts(id) on delete cascade,
  step_order smallint not null check (step_order between 1 and 30),
  step_type text not null check (step_type in ('warmup', 'easy', 'work', 'recovery', 'cooldown', 'strides')),
  label text not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  repeats smallint check (repeats is null or repeats > 0),
  intensity text check (intensity is null or intensity in ('E', 'M', 'T', 'I', 'R')),
  notes text not null default '',
  unique (planned_workout_id, step_order)
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  source public.activity_source not null,
  external_activity_id text,
  name text not null default 'Hardlooptraining',
  activity_type text not null default 'Run',
  started_at timestamptz not null,
  elapsed_seconds integer check (elapsed_seconds is null or elapsed_seconds > 0),
  moving_seconds integer check (moving_seconds is null or moving_seconds > 0),
  distance_meters numeric(10,2) check (distance_meters is null or distance_meters >= 0),
  average_speed_mps numeric(8,4),
  average_heart_rate numeric(5,1),
  average_cadence numeric(5,1),
  total_elevation_meters numeric(8,2),
  raw_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source = 'manual' and external_activity_id is null) or (source = 'strava' and external_activity_id is not null))
);

create unique index activities_source_external_id_idx
  on public.activities (source, external_activity_id);
create index activities_athlete_started_idx on public.activities (athlete_id, started_at desc);

create table public.activity_laps (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  lap_order smallint not null check (lap_order > 0),
  label text not null default '',
  elapsed_seconds integer check (elapsed_seconds is null or elapsed_seconds > 0),
  distance_meters numeric(10,2) check (distance_meters is null or distance_meters >= 0),
  average_speed_mps numeric(8,4),
  average_heart_rate numeric(5,1),
  raw_data jsonb not null default '{}'::jsonb,
  unique (activity_id, lap_order)
);

create table public.activity_workout_links (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  planned_workout_id uuid not null references public.planned_workouts(id) on delete cascade,
  match_method text not null check (match_method in ('manual', 'date_match', 'coach')),
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (activity_id, planned_workout_id)
);

create table public.workout_feedback (
  id uuid primary key default gen_random_uuid(),
  planned_workout_id uuid not null references public.planned_workouts(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete set null,
  state text not null check (state in ('completed', 'skipped')),
  effort public.effort_feedback,
  note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (planned_workout_id, athlete_id)
);

create table public.wellness_entries (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  entry_date date not null default current_date,
  sleep_hours numeric(4,2) check (sleep_hours is null or sleep_hours between 0 and 24),
  resting_heart_rate smallint check (resting_heart_rate is null or resting_heart_rate between 25 and 220),
  recovery_score smallint check (recovery_score is null or recovery_score between 1 and 5),
  note text,
  visible_to_coach boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, entry_date)
);

create table public.coach_suggestions (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  planned_workout_id uuid references public.planned_workouts(id) on delete set null,
  title text not null,
  reason text not null,
  suggested_change jsonb not null default '{}'::jsonb,
  coach_change jsonb not null default '{}'::jsonb,
  state public.suggestion_state not null default 'pending',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coach_changes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid references public.profiles(id) on delete set null,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  planned_workout_id uuid references public.planned_workouts(id) on delete set null,
  suggestion_id uuid references public.coach_suggestions(id) on delete set null,
  original_workout jsonb not null default '{}'::jsonb,
  updated_workout jsonb not null default '{}'::jsonb,
  reason text not null,
  created_at timestamptz not null default now()
);

create table public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Access and refresh tokens are encrypted by the server before storage.
-- No authenticated or anonymous client receives access to this table.
create table public.strava_connections (
  athlete_id uuid primary key references public.profiles(id) on delete cascade,
  strava_athlete_id bigint not null unique,
  access_token_enc text not null,
  refresh_token_enc text not null,
  expires_at timestamptz not null,
  last_synced_at timestamptz,
  is_active boolean not null default true,
  revoked_at timestamptz,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.strava_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  strava_athlete_id bigint not null,
  event_payload jsonb not null,
  processing_state text not null default 'queued' check (processing_state in ('queued', 'processed', 'failed')),
  processed_at timestamptz,
  error_summary text,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  athlete_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  object_type text not null,
  object_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Every exposed public table has RLS enabled. The explicit grants are required
-- for the Supabase Data API; row access remains governed by the policies below.
alter table public.profiles enable row level security;
alter table public.coach_roles enable row level security;
alter table public.coach_athletes enable row level security;
alter table public.training_plans enable row level security;
alter table public.plan_weeks enable row level security;
alter table public.planned_workouts enable row level security;
alter table public.workout_steps enable row level security;
alter table public.activities enable row level security;
alter table public.activity_laps enable row level security;
alter table public.activity_workout_links enable row level security;
alter table public.workout_feedback enable row level security;
alter table public.wellness_entries enable row level security;
alter table public.coach_suggestions enable row level security;
alter table public.coach_changes enable row level security;
alter table public.coach_notes enable row level security;
alter table public.strava_connections enable row level security;
alter table public.strava_webhook_events enable row level security;
alter table public.audit_events enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, preferences, updated_at) on public.profiles to authenticated;
grant select on public.coach_roles to authenticated;
grant select on public.coach_athletes, public.training_plans to authenticated;
grant update (status) on public.coach_athletes to authenticated;
grant select on public.plan_weeks, public.planned_workouts, public.workout_steps to authenticated;
grant select, insert on public.activities to authenticated;
grant update (name, activity_type, started_at, elapsed_seconds, moving_seconds, distance_meters, average_speed_mps, average_heart_rate, average_cadence, total_elevation_meters, raw_summary, updated_at) on public.activities to authenticated;
grant select, insert on public.activity_laps to authenticated;
grant select, insert on public.activity_workout_links to authenticated;
grant select, insert, update on public.workout_feedback to authenticated;
grant select, insert, update on public.wellness_entries to authenticated;
grant select on public.coach_suggestions, public.coach_changes to authenticated;
grant select, insert on public.coach_notes to authenticated;
grant update (note, updated_at) on public.coach_notes to authenticated;
grant all on public.strava_connections to service_role;
grant all on public.strava_webhook_events to service_role;
grant all on public.audit_events to service_role;
grant all on public.coach_roles to service_role;
grant all on public.coach_athletes to service_role;
grant all on public.plan_weeks, public.planned_workouts, public.workout_steps to service_role;
grant all on public.activities, public.activity_laps, public.activity_workout_links to service_role;
grant all on public.workout_feedback, public.wellness_entries, public.coach_suggestions, public.coach_changes, public.coach_notes, public.training_plans, public.profiles to service_role;

create policy "Profiles are visible to self and assigned coaches" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.coach_athletes ca
      where ca.coach_id = (select auth.uid()) and ca.athlete_id = profiles.id and ca.status = 'active'
    )
    or exists (
      select 1 from public.coach_athletes ca
      where ca.athlete_id = (select auth.uid()) and ca.coach_id = profiles.id and ca.status = 'active'
    )
  );
create policy "Users create their own athlete profile" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()) and role = 'athlete');
create policy "Users update their own profile fields" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Users can read their coach role" on public.coach_roles
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Coach and athlete can read their relationship" on public.coach_athletes
  for select to authenticated
  using (coach_id = (select auth.uid()) or athlete_id = (select auth.uid()));
create policy "Assigned coach can update relationship status" on public.coach_athletes
  for update to authenticated
  using (coach_id = (select auth.uid()) and exists (select 1 from public.coach_roles cr where cr.user_id = (select auth.uid())))
  with check (coach_id = (select auth.uid()) and exists (select 1 from public.coach_roles cr where cr.user_id = (select auth.uid())));

create policy "Athlete and assigned coach can read plans" on public.training_plans
  for select to authenticated
  using (
    athlete_id = (select auth.uid())
    or exists (select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = training_plans.athlete_id and ca.status = 'active')
  );
create policy "Athlete creates own plan or coach creates assigned plan" on public.training_plans
  for insert to authenticated
  with check (
    (athlete_id = (select auth.uid()) and coach_id is null)
    or (coach_id = (select auth.uid()) and exists (
      select 1 from public.coach_athletes ca
      where ca.coach_id = (select auth.uid()) and ca.athlete_id = training_plans.athlete_id and ca.status = 'active'
    ))
  );
create policy "Athlete and assigned coach can update plans" on public.training_plans
  for update to authenticated
  using (
    athlete_id = (select auth.uid())
    or exists (select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = training_plans.athlete_id and ca.status = 'active')
  )
  with check (
    athlete_id = (select auth.uid())
    or exists (select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = training_plans.athlete_id and ca.status = 'active')
  );

create policy "Plan weeks are visible to plan owner and assigned coach" on public.plan_weeks
  for select to authenticated
  using (exists (
    select 1 from public.training_plans p
    where p.id = plan_weeks.plan_id and (
      p.athlete_id = (select auth.uid())
      or exists (select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = p.athlete_id and ca.status = 'active')
    )
  ));
create policy "Workouts are visible to athlete and assigned coach" on public.planned_workouts
  for select to authenticated
  using (
    athlete_id = (select auth.uid())
    or exists (select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = planned_workouts.athlete_id and ca.status = 'active')
  );
create policy "Workout steps follow workout access" on public.workout_steps
  for select to authenticated
  using (exists (
    select 1 from public.planned_workouts pw
    where pw.id = workout_steps.planned_workout_id and (
      pw.athlete_id = (select auth.uid())
      or exists (select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = pw.athlete_id and ca.status = 'active')
    )
  ));

create policy "Athlete and assigned coach can read activities" on public.activities
  for select to authenticated
  using (
    athlete_id = (select auth.uid())
    or exists (select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = activities.athlete_id and ca.status = 'active')
  );
create policy "Athlete can enter manual activities" on public.activities
  for insert to authenticated
  with check (athlete_id = (select auth.uid()) and source = 'manual' and external_activity_id is null);
create policy "Athlete can update their manual activities" on public.activities
  for update to authenticated
  using (athlete_id = (select auth.uid()) and source = 'manual')
  with check (athlete_id = (select auth.uid()) and source = 'manual' and external_activity_id is null);

create policy "Activity laps follow activity access" on public.activity_laps
  for select to authenticated
  using (exists (
    select 1 from public.activities a
    where a.id = activity_laps.activity_id and (
      a.athlete_id = (select auth.uid())
      or exists (select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = a.athlete_id and ca.status = 'active')
    )
  ));
create policy "Athlete can add laps to manual activities" on public.activity_laps
  for insert to authenticated
  with check (exists (
    select 1 from public.activities a
    where a.id = activity_laps.activity_id and a.athlete_id = (select auth.uid()) and a.source = 'manual'
  ));

create policy "Activity links follow activity access" on public.activity_workout_links
  for select to authenticated
  using (exists (
    select 1 from public.activities a
    where a.id = activity_workout_links.activity_id and (
      a.athlete_id = (select auth.uid())
      or exists (select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = a.athlete_id and ca.status = 'active')
    )
  ));
create policy "Athlete can link own activity to a workout" on public.activity_workout_links
  for insert to authenticated
  with check (exists (
    select 1 from public.activities a
    where a.id = activity_workout_links.activity_id and a.athlete_id = (select auth.uid())
  ) and exists (
    select 1 from public.planned_workouts pw
    where pw.id = activity_workout_links.planned_workout_id and pw.athlete_id = (select auth.uid())
  ));

create policy "Feedback is visible to athlete and assigned coach" on public.workout_feedback
  for select to authenticated
  using (
    athlete_id = (select auth.uid())
    or exists (select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = workout_feedback.athlete_id and ca.status = 'active')
  );
create policy "Athlete can add own feedback" on public.workout_feedback
  for insert to authenticated
  with check (
    athlete_id = (select auth.uid())
    and exists (select 1 from public.planned_workouts pw where pw.id = workout_feedback.planned_workout_id and pw.athlete_id = (select auth.uid()))
  );
create policy "Athlete can update own feedback" on public.workout_feedback
  for update to authenticated
  using (athlete_id = (select auth.uid()))
  with check (
    athlete_id = (select auth.uid())
    and exists (select 1 from public.planned_workouts pw where pw.id = workout_feedback.planned_workout_id and pw.athlete_id = (select auth.uid()))
  );

create policy "Athlete sees own wellness and coach sees shared entries" on public.wellness_entries
  for select to authenticated
  using (
    athlete_id = (select auth.uid())
    or (visible_to_coach and exists (
      select 1 from public.coach_athletes ca
      where ca.coach_id = (select auth.uid()) and ca.athlete_id = wellness_entries.athlete_id and ca.status = 'active'
    ))
  );
create policy "Athlete adds own optional wellness data" on public.wellness_entries
  for insert to authenticated with check (athlete_id = (select auth.uid()));
create policy "Athlete updates own wellness data" on public.wellness_entries
  for update to authenticated using (athlete_id = (select auth.uid())) with check (athlete_id = (select auth.uid()));

create policy "Coach and athlete can read suggestions" on public.coach_suggestions
  for select to authenticated
  using (
    athlete_id = (select auth.uid())
    or (coach_id = (select auth.uid()) and exists (
      select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = coach_suggestions.athlete_id and ca.status = 'active'
    ))
  );
create policy "Assigned coach can create suggestions" on public.coach_suggestions
  for insert to authenticated
  with check (
    coach_id = (select auth.uid())
    and exists (select 1 from public.coach_roles cr where cr.user_id = (select auth.uid()))
    and exists (select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = coach_suggestions.athlete_id and ca.status = 'active')
  );
create policy "Assigned coach can review suggestions" on public.coach_suggestions
  for update to authenticated
  using (
    coach_id = (select auth.uid())
    and exists (select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = coach_suggestions.athlete_id and ca.status = 'active')
  )
  with check (
    coach_id = (select auth.uid())
    and exists (select 1 from public.coach_roles cr where cr.user_id = (select auth.uid()))
    and exists (select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = coach_suggestions.athlete_id and ca.status = 'active')
  );

create policy "Coach changes are visible to athlete and assigned coach" on public.coach_changes
  for select to authenticated
  using (
    athlete_id = (select auth.uid())
    or exists (select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = coach_changes.athlete_id and ca.status = 'active')
  );
create policy "Assigned coach can record changes" on public.coach_changes
  for insert to authenticated
  with check (
    coach_id = (select auth.uid())
    and exists (select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = coach_changes.athlete_id and ca.status = 'active')
  );

create policy "Assigned coach can read private coach notes" on public.coach_notes
  for select to authenticated
  using (coach_id = (select auth.uid()) and exists (
    select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = coach_notes.athlete_id and ca.status = 'active'
  ));
create policy "Assigned coach can add private coach notes" on public.coach_notes
  for insert to authenticated
  with check (coach_id = (select auth.uid()) and exists (
    select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = coach_notes.athlete_id and ca.status = 'active'
  ));
create policy "Assigned coach can update private coach notes" on public.coach_notes
  for update to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()) and exists (
    select 1 from public.coach_athletes ca where ca.coach_id = (select auth.uid()) and ca.athlete_id = coach_notes.athlete_id and ca.status = 'active'
  ));

-- Server-only tables have RLS enabled but intentionally have no client policies.
-- service_role is used only by server routes and is never exposed to the browser.
