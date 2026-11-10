import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { formatPace, currentWeekNumber } from '@/lib/training-plan'
import { todayDateISO } from '@/lib/dates'
import type { PlanWeek } from '@/lib/training-plan'
import type { AppRole, AthleteSummary, DashboardData, RunActivity, WellnessEntry } from '@/lib/types'

type Row = Record<string, unknown>

function numberValue(value: unknown): number | undefined {
  const number = Number(value)
  return Number.isFinite(number) && value !== null && value !== undefined ? number : undefined
}

function timeLabel(secondsValue: unknown): string {
  const seconds = Math.round(numberValue(secondsValue) ?? 0)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return [hours, minutes, remainder].map((part) => String(part).padStart(2, '0')).join(':')
}

function weekdayLabel(value: string): string {
  return new Intl.DateTimeFormat('nl-NL', { weekday: 'short' }).format(new Date(value + 'T12:00:00'))
}

function effortName(value: unknown): RunActivity['effort'] {
  if (value === 'easier' || value === 'harder' || value === 'not_good' || value === 'as_expected') return value
  return undefined
}

function mapWellness(row: Row): WellnessEntry {
  return {
    id: String(row.id),
    date: String(row.entry_date),
    sleepHours: numberValue(row.sleep_hours),
    restingHeartRate: numberValue(row.resting_heart_rate),
    recoveryScore: numberValue(row.recovery_score),
    note: typeof row.note === 'string' ? row.note : undefined,
    visibleToCoach: Boolean(row.visible_to_coach),
  }
}

function mapActivities(activityRows: Row[], lapRows: Row[], linkRows: Row[]): RunActivity[] {
  const lapsByActivity = new Map<string, Row[]>()
  for (const lap of lapRows) {
    const activityId = String(lap.activity_id)
    lapsByActivity.set(activityId, [...(lapsByActivity.get(activityId) ?? []), lap])
  }
  const linkByActivity = new Map(linkRows.map((link) => [String(link.activity_id), String(link.planned_workout_id)]))
  return activityRows.map((row) => {
    const id = String(row.id)
    const raw = (row.raw_summary && typeof row.raw_summary === 'object' ? row.raw_summary : {}) as Row
    const speed = numberValue(row.average_speed_mps)
    const distance = numberValue(row.distance_meters)
    const duration = numberValue(row.elapsed_seconds)
    const laps = (lapsByActivity.get(id) ?? []).sort((a, b) => Number(a.lap_order) - Number(b.lap_order))
    return {
      id,
      name: String(row.name ?? 'Hardlooptraining'),
      startedAt: String(row.started_at),
      activityType: String(row.activity_type ?? 'Run'),
      durationMinutes: Math.round((duration ?? numberValue(row.moving_seconds) ?? 0) / 60),
      distanceKm: distance !== undefined ? Math.round((distance / 1000) * 100) / 100 : undefined,
      pace: speed && speed > 0 ? formatPace(1000 / speed) : undefined,
      averageHeartRate: numberValue(row.average_heart_rate),
      source: row.source === 'strava' ? 'strava' as const : raw.import_source === 'fit' ? 'upload' as const : 'manual' as const,
      plannedWorkoutId: linkByActivity.get(id),
      note: typeof raw.note === 'string' ? raw.note : undefined,
      effort: effortName(raw.effort),
      laps: laps.length ? laps.map((lap, index) => {
        const lapSpeed = numberValue(lap.average_speed_mps)
        const lapDistance = numberValue(lap.distance_meters)
        return {
          id: String(lap.id),
          label: String(lap.label || 'Lap ' + (index + 1)),
          durationMinutes: numberValue(lap.elapsed_seconds) ? Math.round(Number(lap.elapsed_seconds) / 60) : undefined,
          distanceKm: lapDistance !== undefined ? Math.round((lapDistance / 1000) * 100) / 100 : undefined,
          pace: lapSpeed && lapSpeed > 0 ? formatPace(1000 / lapSpeed) : undefined,
          averageHeartRate: numberValue(lap.average_heart_rate),
        }
      }) : undefined,
    }
  }).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

async function loadActivities(supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createServerSupabaseClient>>, athleteId: string) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data: activityData } = await supabase.from('activities').select('*').eq('athlete_id', athleteId).gte('started_at', since).order('started_at', { ascending: false }).limit(100)
  const activities = (activityData ?? []) as unknown as Row[]
  const ids = activities.map((row) => String(row.id))
  if (!ids.length) return [] as RunActivity[]
  const [{ data: lapData }, { data: linkData }] = await Promise.all([
    supabase.from('activity_laps').select('*').in('activity_id', ids),
    supabase.from('activity_workout_links').select('activity_id,planned_workout_id').in('activity_id', ids),
  ])
  return mapActivities(activities, (lapData ?? []) as unknown as Row[], (linkData ?? []) as unknown as Row[])
}

async function loadPlan(supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createServerSupabaseClient>>, athleteId: string) {
  const { data: planData } = await supabase.from('training_plans').select('*').eq('athlete_id', athleteId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!planData) return null
  const plan = planData as unknown as Row
  const planId = String(plan.id)
  const [{ data: weekData }, { data: workoutData }] = await Promise.all([
    supabase.from('plan_weeks').select('*').eq('plan_id', planId).order('week_number'),
    supabase.from('planned_workouts').select('*').eq('plan_id', planId).order('workout_date'),
  ])
  const weeks = (weekData ?? []) as unknown as Row[]
  const workouts = (workoutData ?? []) as unknown as Row[]
  const workoutIds = workouts.map((item) => String(item.id))
  const [{ data: stepData }, { data: feedbackData }] = workoutIds.length ? await Promise.all([
    supabase.from('workout_steps').select('*').in('planned_workout_id', workoutIds).order('step_order'),
    supabase.from('workout_feedback').select('planned_workout_id,state,effort,note,completed_at').eq('athlete_id', athleteId).in('planned_workout_id', workoutIds),
  ]) : [{ data: [] }, { data: [] }]
  const steps = ((stepData ?? []) as unknown as Row[])
  const feedback = ((feedbackData ?? []) as unknown as Row[])
  const stepsByWorkout = new Map<string, Row[]>()
  for (const step of steps) {
    const workoutId = String(step.planned_workout_id)
    stepsByWorkout.set(workoutId, [...(stepsByWorkout.get(workoutId) ?? []), step])
  }
  const feedbackByWorkout = new Map(feedback.map((entry) => [String(entry.planned_workout_id), entry]))
  const workoutsByWeek = new Map<string, Row[]>()
  for (const workout of workouts) {
    const weekId = String(workout.plan_week_id)
    workoutsByWeek.set(weekId, [...(workoutsByWeek.get(weekId) ?? []), workout])
  }
  const planWeeks: PlanWeek[] = weeks.map((week) => {
    const weekId = String(week.id)
    const weekWorkouts = (workoutsByWeek.get(weekId) ?? []).sort((a, b) => Number(a.workout_order) - Number(b.workout_order)).map((workout) => {
      const workoutId = String(workout.id)
      const checkin = feedbackByWorkout.get(workoutId)
      const workoutSteps = (stepsByWorkout.get(workoutId) ?? []).map((step) => ({
        kind: String(step.step_type) as PlanWeek['workouts'][number]['steps'][number]['kind'],
        label: String(step.label),
        durationMinutes: numberValue(step.duration_minutes),
        repeats: numberValue(step.repeats),
        intensity: typeof step.intensity === 'string' ? step.intensity as 'E' | 'M' | 'T' | 'I' | 'R' : undefined,
      }))
      const checkinState = checkin?.state
      const state: PlanWeek['workouts'][number]['status'] = checkinState === 'completed' ? 'completed' : checkinState === 'skipped' ? 'skipped' : workout.state === 'adjusted' ? 'adjusted' : workout.state === 'skipped' ? 'skipped' : 'planned'
      const feedbackEffort = ['easier', 'as_expected', 'harder', 'not_good'].includes(String(checkin?.effort))
        ? String(checkin?.effort) as NonNullable<PlanWeek['workouts'][number]['feedback']>['effort']
        : undefined
      const feedbackNote = typeof checkin?.note === 'string' ? checkin.note : undefined
      const feedback = checkinState === 'completed' && (feedbackEffort || feedbackNote)
        ? { effort: feedbackEffort, note: feedbackNote || undefined, completedAt: typeof checkin?.completed_at === 'string' ? checkin.completed_at : undefined }
        : undefined
      return {
        id: workoutId,
        date: String(workout.workout_date),
        day: weekdayLabel(String(workout.workout_date)),
        title: String(workout.title),
        type: String(workout.workout_type) as PlanWeek['workouts'][number]['type'],
        durationMinutes: numberValue(workout.duration_minutes),
        distanceKm: numberValue(workout.distance_km),
        timeCapMinutes: numberValue(workout.time_cap_minutes),
        intensity: String(workout.intensity ?? ''),
        goal: String(workout.goal ?? ''),
        description: String(workout.description ?? ''),
        steps: workoutSteps,
        status: state,
        optional: Boolean(workout.is_optional),
        feedback,
      }
    })
    return {
      weekNumber: Number(week.week_number),
      phase: String(week.phase) as PlanWeek['phase'],
      goal: String(week.goal ?? ''),
      isRecoveryWeek: Boolean(week.is_recovery_week),
      workouts: weekWorkouts,
    }
  })
  const length = Number(plan.plan_length) as 12 | 16 | 20
  const today = new Date(todayDateISO() + 'T12:00:00.000Z')
  const optionalWorkout = workouts.find((workout) => Boolean(workout.is_optional))
  const optionalTrainingDay = optionalWorkout ? new Date(String(optionalWorkout.workout_date) + 'T12:00:00.000Z').getUTCDay() : 6
  return {
    length,
    marathonDate: String(plan.marathon_date),
    goalTime: timeLabel(plan.goal_time_seconds),
    currentWeek: currentWeekNumber(planWeeks, today),
    weeks: planWeeks,
    trainingDays: Array.isArray(plan.training_days) ? plan.training_days.map(Number) : [2, 4, 0],
    includeOptionalFourth: Boolean(plan.has_optional_fourth),
    optionalTrainingDay,
  }
}

async function loadWellness(supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createServerSupabaseClient>>, athleteId: string): Promise<WellnessEntry[]> {
  const { data } = await supabase.from('wellness_entries').select('*').eq('athlete_id', athleteId).order('entry_date', { ascending: false }).limit(10)
  return ((data ?? []) as unknown as Row[]).map(mapWellness)
}

async function loadCoachData(supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createServerSupabaseClient>>, userId: string, fullName: string): Promise<DashboardData> {
  const { data: relationshipData } = await supabase.from('coach_athletes').select('athlete_id').eq('coach_id', userId).eq('status', 'active').limit(50)
  const athleteIds = [...new Set(((relationshipData ?? []) as unknown as Row[]).map((item) => String(item.athlete_id)))]
  const [profileResult, suggestionResult, noteResult] = await Promise.all([
    athleteIds.length ? supabase.from('profiles').select('id,full_name').in('id', athleteIds) : Promise.resolve({ data: [] }),
    supabase.from('coach_suggestions').select('*').eq('coach_id', userId).order('created_at', { ascending: false }).limit(50),
    athleteIds.length ? supabase.from('coach_notes').select('id,athlete_id,note,created_at').eq('coach_id', userId).in('athlete_id', athleteIds).order('created_at', { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
  ])
  const profiles = ((profileResult.data ?? []) as unknown as Row[])
  const nameById = new Map(profiles.map((profile) => [String(profile.id), String(profile.full_name ?? 'Atleet')]))
  const notesByAthlete = new Map<string, { id: string; note: string; createdAt: string }[]>()
  for (const row of (noteResult.data ?? []) as unknown as Row[]) {
    const athleteId = String(row.athlete_id)
    notesByAthlete.set(athleteId, [...(notesByAthlete.get(athleteId) ?? []), { id: String(row.id), note: String(row.note), createdAt: String(row.created_at) }])
  }
  const athleteData = await Promise.all(athleteIds.map(async (athleteId): Promise<AthleteSummary> => {
    const [plan, activities, wellness] = await Promise.all([loadPlan(supabase, athleteId), loadActivities(supabase, athleteId), loadWellness(supabase, athleteId)])
    const currentWeek = plan?.weeks.find((week) => week.weekNumber === plan.currentWeek)
    const required = currentWeek?.workouts.filter((workout) => !workout.optional) ?? []
    const completed = required.filter((workout) => workout.status === 'completed')
    const latestActivity = activities[0]
    const lastFeedback = latestActivity?.effort ? ({ easier: 'Makkelijker dan verwacht', as_expected: 'Zoals verwacht', harder: 'Zwaarder dan verwacht', not_good: 'Niet goed gegaan' } as const)[latestActivity.effort] : undefined
    const lastLong = plan?.weeks.flatMap((week) => week.workouts).filter((workout) => workout.type === 'long' && workout.status === 'completed').sort((a, b) => b.date.localeCompare(a.date))[0]
    const overdue = required.filter((workout) => workout.date < todayDateISO() && workout.status === 'planned').length
    const risk: AthleteSummary['risk'] = overdue >= 2 ? 'red' : latestActivity?.effort === 'harder' || latestActivity?.effort === 'not_good' ? 'orange' : 'green'
    const marathonDate = plan?.marathonDate ?? ''
    return {
      id: athleteId,
      name: nameById.get(athleteId) ?? 'Atleet',
      marathonDate,
      goalTime: plan?.goalTime ?? '',
      planLength: plan?.length ?? 16,
      currentWeek: plan?.currentWeek ?? 1,
      phase: currentWeek ? currentWeek.phase : 'Plan nog niet gestart',
      plannedThisWeek: required.length,
      completedThisWeek: completed.length,
      lastActivity: latestActivity ? dateLabelForActivity(latestActivity) + ' · ' + (latestActivity.distanceKm ? latestActivity.distanceKm.toFixed(1).replace('.', ',') + ' km' : latestActivity.durationMinutes + ' min') : undefined,
      lastFeedback,
      lastLongRun: lastLong ? dateLabelForActivity({ startedAt: lastLong.date }) + ' · ' + (lastLong.distanceKm ? lastLong.distanceKm + ' km' : lastLong.durationMinutes + ' min') : undefined,
      risk,
      reason: overdue >= 2 ? 'Meerdere trainingen staan na de geplande datum nog open.' : latestActivity?.effort === 'harder' || latestActivity?.effort === 'not_good' ? 'De laatste training voelde zwaarder dan verwacht.' : undefined,
      activities,
      wellness: wellness.filter((entry) => entry.visibleToCoach),
      coachNotes: notesByAthlete.get(athleteId) ?? [],
      planWeeks: plan?.weeks ?? [],
    }
  }))
  const suggestions = ((suggestionResult.data ?? []) as unknown as Row[]).map((row) => {
    const athleteId = String(row.athlete_id)
    const change = (row.suggested_change && typeof row.suggested_change === 'object' ? row.suggested_change : {}) as Row
    const state = String(row.state) as 'pending' | 'accepted' | 'modified' | 'rejected'
    return {
      id: String(row.id),
      athleteId,
      athleteName: nameById.get(athleteId) ?? 'Atleet',
      title: String(row.title),
      reason: String(row.reason),
      replacement: typeof change.description === 'string' ? change.description : undefined,
      status: state,
      createdAt: String(row.created_at),
    }
  })
  const admin = createAdminSupabaseClient()
  const [{ data: stravaConnection }, activities] = await Promise.all([
    admin.from('strava_connections').select('is_active').eq('athlete_id', userId).maybeSingle(),
    loadActivities(supabase, userId),
  ])
  return {
    profile: { id: userId, name: fullName, role: 'coach' },
    stravaConnected: Boolean(stravaConnection?.is_active),
    plan: null,
    activities,
    wellness: [],
    athletes: athleteData,
    suggestions,
  }
}

function dateLabelForActivity(activity: { startedAt: string }): string {
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(new Date(activity.startedAt.slice(0, 10) + 'T12:00:00'))
}

export async function loadDashboardData(): Promise<DashboardData> {
  const { createServerSupabaseClient } = await import('@/lib/supabase/server')
  const supabase = await createServerSupabaseClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData.user) throw new Error('Je sessie is verlopen. Log opnieuw in.')
  const user = authData.user
  const { data: profileData } = await supabase.from('profiles').select('id,full_name,role').eq('id', user.id).maybeSingle()
  let profile = profileData as unknown as Row | null
  if (!profile) {
    const { data: createdProfile, error } = await supabase.from('profiles').insert({ id: user.id, full_name: String(user.user_metadata.full_name ?? user.email ?? '') }).select('id,full_name,role').single()
    if (error) throw new Error('Je profiel kan nog niet worden aangemaakt. Controleer of de databasemigratie is toegepast.')
    profile = createdProfile as unknown as Row
  }
  const fullName = String(profile.full_name || user.user_metadata.full_name || user.email || 'Atleet')
  const role = (profile.role === 'coach' ? 'coach' : 'athlete') as AppRole
  if (role === 'coach') return loadCoachData(supabase, user.id, fullName)

  const [plan, activities, wellness] = await Promise.all([loadPlan(supabase, user.id), loadActivities(supabase, user.id), loadWellness(supabase, user.id)])
  const { data: suggestionData } = await supabase.from('coach_suggestions').select('*').eq('athlete_id', user.id).order('created_at', { ascending: false }).limit(20)
  const suggestions = ((suggestionData ?? []) as unknown as Row[]).map((row) => ({
    id: String(row.id),
    athleteId: user.id,
    athleteName: fullName,
    title: String(row.title),
    reason: String(row.reason),
    status: String(row.state) as 'pending' | 'accepted' | 'modified' | 'rejected',
    createdAt: String(row.created_at),
  }))
  const admin = createAdminSupabaseClient()
  const { data: stravaConnection } = await admin.from('strava_connections').select('is_active').eq('athlete_id', user.id).maybeSingle()
  return {
    profile: { id: user.id, name: fullName, role },
    stravaConnected: Boolean(stravaConnection?.is_active),
    plan,
    activities,
    wellness,
    athletes: [],
    suggestions,
  }
}
