import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { calculateTrainingPaces, generatePlan, parseDurationToSeconds, type PlanLength } from '@/lib/training-plan'
import { isSameOriginRequest, jsonError } from '@/lib/http'

function isPlanLength(value: unknown): value is PlanLength {
  return value === 12 || value === 16 || value === 20
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)
  const supabase = await createServerSupabaseClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData.user
  if (!user) return jsonError('Log opnieuw in om je plan op te slaan.', 401)

  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> } catch { return jsonError('Controleer de ingevulde gegevens.', 400) }
  const targetAthleteId = typeof body.athleteId === 'string' && body.athleteId ? body.athleteId : user.id
  const length = Number(body.planLength)
  const marathonDate = typeof body.marathonDate === 'string' ? body.marathonDate : ''
  const goalSeconds = parseDurationToSeconds(typeof body.goalTime === 'string' ? body.goalTime : '')
  const trainingDays = Array.isArray(body.trainingDays) ? body.trainingDays.map(Number) : []
  const includeOptionalFourth = body.includeOptionalFourth === true
  const optionalTrainingDay = Number(body.optionalTrainingDay ?? 6)
  if (!isPlanLength(length) || !/^\d{4}-\d{2}-\d{2}$/.test(marathonDate) || !goalSeconds || trainingDays.length !== 3 || new Set(trainingDays).size !== 3 || trainingDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    return jsonError('Vul een geldige marathondatum, streeftijd, planlengte en drie verschillende trainingsdagen in.', 400)
  }
  if (includeOptionalFourth && (!Number.isInteger(optionalTrainingDay) || optionalTrainingDay < 0 || optionalTrainingDay > 6 || trainingDays.includes(optionalTrainingDay))) {
    return jsonError('Kies voor de optionele training een dag die niet al bij de vaste dagen staat.', 400)
  }

  let coachId: string | null = null
  if (targetAthleteId !== user.id) {
    const { data: coachRole } = await supabase.from('coach_roles').select('user_id').eq('user_id', user.id).maybeSingle()
    const { data: assignment } = await supabase.from('coach_athletes').select('athlete_id').eq('coach_id', user.id).eq('athlete_id', targetAthleteId).eq('status', 'active').maybeSingle()
    if (!coachRole || !assignment) return jsonError('Je kunt alleen een plan maken voor een atleet die aan jou is toegewezen.', 403)
    coachId = user.id
  }

  const raceDistance = Number(body.recentRaceDistanceKm)
  const raceTime = Number(body.recentRaceTimeSeconds)
  const trainingPaces = Number.isFinite(raceDistance) && Number.isFinite(raceTime) && raceDistance > 0 && raceTime > 0
    ? calculateTrainingPaces(raceDistance, raceTime, goalSeconds) ?? {}
    : {}
  let weeks
  try {
    weeks = generatePlan({ marathonDate, length, trainingDays, includeOptionalFourth, optionalTrainingDay, goalTimeSeconds: goalSeconds })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Het plan kan niet worden opgebouwd.', 400)
  }

  let admin
  try { admin = createAdminSupabaseClient() } catch { return jsonError('De beveiligde serverkoppeling is nog niet ingesteld.', 503) }
  const { data: createdPlan, error: planError } = await admin.from('training_plans').insert({
    athlete_id: targetAthleteId,
    coach_id: coachId,
    plan_length: length,
    marathon_date: marathonDate,
    goal_time_seconds: goalSeconds,
    recent_race_distance_km: Number.isFinite(raceDistance) && raceDistance > 0 ? raceDistance : null,
    recent_race_time_seconds: Number.isFinite(raceTime) && raceTime > 0 ? raceTime : null,
    training_days: trainingDays,
    has_optional_fourth: includeOptionalFourth,
    training_paces: trainingPaces,
    status: 'draft',
  }).select('id').single()
  if (planError || !createdPlan) return jsonError('Het plan kon niet worden aangemaakt. Controleer de database-instellingen.', 500)
  const planId = String(createdPlan.id)

  try {
    const weekRows = weeks.map((week) => ({ plan_id: planId, week_number: week.weekNumber, phase: week.phase, goal: week.goal, is_recovery_week: week.isRecoveryWeek }))
    const { data: insertedWeeks, error: weeksError } = await admin.from('plan_weeks').insert(weekRows).select('id,week_number')
    if (weeksError || !insertedWeeks) throw new Error('week rows')
    const weekIdByNumber = new Map(insertedWeeks.map((week) => [Number(week.week_number), String(week.id)]))
    const workoutRows = weeks.flatMap((week) => week.workouts.map((workout, index) => ({
      plan_id: planId,
      plan_week_id: weekIdByNumber.get(week.weekNumber),
      athlete_id: targetAthleteId,
      workout_order: index + 1,
      workout_date: workout.date,
      workout_type: workout.type,
      title: workout.title,
      duration_minutes: workout.durationMinutes ?? null,
      distance_km: workout.distanceKm ?? null,
      time_cap_minutes: workout.timeCapMinutes ?? null,
      intensity: workout.intensity,
      goal: workout.goal,
      description: workout.description,
      state: 'planned',
      is_optional: workout.optional,
    })))
    const { data: insertedWorkouts, error: workoutsError } = await admin.from('planned_workouts').insert(workoutRows).select('id,plan_week_id,workout_order')
    if (workoutsError || !insertedWorkouts) throw new Error('workout rows')
    const weekNumberById = new Map([...weekIdByNumber.entries()].map(([number, id]) => [id, number]))
    const sourceByOrder = new Map(weeks.flatMap((week) => week.workouts.map((workout, index) => [week.weekNumber + ':' + (index + 1), workout] as const)))
    const stepRows = insertedWorkouts.flatMap((workout) => {
      const weekNumber = weekNumberById.get(String(workout.plan_week_id))
      const source = weekNumber ? sourceByOrder.get(weekNumber + ':' + Number(workout.workout_order)) : undefined
      return (source?.steps ?? []).map((step, index) => ({
        planned_workout_id: String(workout.id),
        step_order: index + 1,
        step_type: step.kind,
        label: step.label,
        duration_minutes: step.durationMinutes ?? null,
        repeats: step.repeats ?? null,
        intensity: step.intensity ?? null,
      }))
    })
    if (stepRows.length) {
      const { error: stepError } = await admin.from('workout_steps').insert(stepRows)
      if (stepError) throw new Error('step rows')
    }

    await admin.from('training_plans').update({ status: 'paused' }).eq('athlete_id', targetAthleteId).eq('status', 'active')
    const { error: activateError } = await admin.from('training_plans').update({ status: 'active' }).eq('id', planId)
    if (activateError) throw new Error('activate')
    return Response.json({ ok: true, planId }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch {
    await admin.from('training_plans').delete().eq('id', planId)
    return jsonError('Het plan is niet volledig opgeslagen. Probeer het opnieuw.', 500)
  }
}
