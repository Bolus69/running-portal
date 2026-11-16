import { randomUUID } from 'node:crypto'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { calculateTrainingPaces, generatePlan, nextMondayDate, parseDurationToSeconds, type PlanLength } from '@/lib/training-plan'
import { isSameOriginRequest, jsonError } from '@/lib/http'

function isPlanLength(value: unknown): value is PlanLength {
  return value === 12 || value === 16 || value === 20
}

function optionalKm(value: unknown, max: number): { valid: boolean; value: number | null } {
  if (value === undefined || value === null || value === '') return { valid: true, value: null }
  if (typeof value !== 'number' && typeof value !== 'string') return { valid: false, value: null }
  const parsed = Number(value)
  return { valid: Number.isFinite(parsed) && parsed > 0 && parsed <= max, value: parsed }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)
  const supabase = await createServerSupabaseClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData.user
  if (!user) return jsonError('Log opnieuw in om je plan op te slaan.', 401)

  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> } catch { return jsonError('Controleer de ingevulde gegevens.', 400) }
  const targetAthleteId = typeof body.athleteId === 'string' && body.athleteId ? body.athleteId : ''
  if (!targetAthleteId) return jsonError('Selecteer eerst een atleet voor het trainingsschema.', 400)
  const { data: coachRole } = await supabase.from('coach_roles').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!coachRole) return jsonError('Je bent niet ingelogd als coach. Log uit en log in met je coachaccount.', 403)
  if (targetAthleteId === user.id) return jsonError('Kies een toegewezen atleet; je eigen coachaccount kan geen trainingsschema krijgen.', 403)
  const length = Number(body.planLength)
  const marathonDate = typeof body.marathonDate === 'string' ? body.marathonDate : ''
  const goalSeconds = parseDurationToSeconds(typeof body.goalTime === 'string' ? body.goalTime : '')
  const trainingDays = Array.isArray(body.trainingDays) ? body.trainingDays.map(Number) : []
  const includeOptionalFourth = body.includeOptionalFourth === true
  const optionalTrainingDay = Number(body.optionalTrainingDay ?? 6)
  const recentWeeklyKm = optionalKm(body.recentWeeklyKm, 300)
  const recentLongestRunKm = optionalKm(body.recentLongestRunKm, 100)
  if (!isPlanLength(length) || !/^\d{4}-\d{2}-\d{2}$/.test(marathonDate) || !goalSeconds || trainingDays.length !== 3 || new Set(trainingDays).size !== 3 || trainingDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    return jsonError('Vul een geldige marathondatum, streeftijd, planlengte en drie verschillende trainingsdagen in.', 400)
  }
  if (!recentWeeklyKm.valid || !recentLongestRunKm.valid) return jsonError('Vul voor de recente trainingsbasis een geldige afstand in, of laat het veld leeg.', 400)
  if (includeOptionalFourth && (!Number.isInteger(optionalTrainingDay) || optionalTrainingDay < 0 || optionalTrainingDay > 6 || trainingDays.includes(optionalTrainingDay))) {
    return jsonError('Kies voor de optionele training een dag die niet al bij de vaste dagen staat.', 400)
  }

  const { data: assignment } = await supabase.from('coach_athletes').select('athlete_id').eq('coach_id', user.id).eq('athlete_id', targetAthleteId).eq('status', 'active').maybeSingle()
  if (!assignment) return jsonError('Je kunt alleen een plan maken voor een atleet die aan jou is toegewezen.', 403)
  const coachId = user.id
  const { data: activePlan, error: activePlanError } = await supabase.from('training_plans').select('id').eq('athlete_id', targetAthleteId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (activePlanError) return jsonError('Het bestaande schema kon niet worden gecontroleerd. Probeer het opnieuw.', 500)
  const effectiveStartDate = activePlan ? nextMondayDate() : undefined

  const raceDistance = Number(body.recentRaceDistanceKm)
  const raceTime = Number(body.recentRaceTimeSeconds)
  const trainingPaces = Number.isFinite(raceDistance) && Number.isFinite(raceTime) && raceDistance > 0 && raceTime > 0
    ? calculateTrainingPaces(raceDistance, raceTime, goalSeconds) ?? {}
    : {}
  let weeks
  try {
    weeks = generatePlan({ marathonDate, length, trainingDays, includeOptionalFourth, optionalTrainingDay, goalTimeSeconds: goalSeconds, effectiveStartDate })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Het plan kan niet worden opgebouwd.', 400)
  }

  let admin
  try { admin = createAdminSupabaseClient() } catch { return jsonError('De beveiligde serverkoppeling is nog niet ingesteld.', 503) }
  const planId = randomUUID()
  const weekIdByNumber = new Map(weeks.map((week) => [week.weekNumber, randomUUID()]))
  const weekRows = weeks.map((week) => ({ id: weekIdByNumber.get(week.weekNumber), plan_id: planId, week_number: week.weekNumber, phase: week.phase, goal: week.goal, is_recovery_week: week.isRecoveryWeek }))
  const workoutRows: Record<string, unknown>[] = []
  const stepRows: Record<string, unknown>[] = []
  for (const week of weeks) {
    const planWeekId = weekIdByNumber.get(week.weekNumber)
    for (const [index, workout] of week.workouts.entries()) {
      const workoutId = randomUUID()
      workoutRows.push({
        id: workoutId,
        plan_id: planId,
        plan_week_id: planWeekId,
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
      })
      workout.steps.forEach((step, stepIndex) => stepRows.push({
        planned_workout_id: workoutId,
        step_order: stepIndex + 1,
        step_type: step.kind,
        label: step.label,
        duration_minutes: step.durationMinutes ?? null,
        repeats: step.repeats ?? null,
        intensity: step.intensity ?? null,
      }))
    }
  }
  const { data: createdPlanId, error: createError } = await admin.rpc('create_training_plan_bundle', {
    p_plan: {
      id: planId,
      athlete_id: targetAthleteId,
      coach_id: coachId,
      plan_length: length,
      marathon_date: marathonDate,
      effective_start_date: effectiveStartDate ?? null,
      goal_time_seconds: goalSeconds,
      recent_race_distance_km: Number.isFinite(raceDistance) && raceDistance > 0 ? raceDistance : null,
      recent_race_time_seconds: Number.isFinite(raceTime) && raceTime > 0 ? raceTime : null,
      recent_weekly_km: recentWeeklyKm.value,
      recent_longest_run_km: recentLongestRunKm.value,
      training_days: trainingDays,
      has_optional_fourth: includeOptionalFourth,
      training_paces: trainingPaces,
    },
    p_weeks: weekRows,
    p_workouts: workoutRows,
    p_steps: stepRows,
  })
  if (createError || !createdPlanId) return jsonError('Het plan kon niet volledig en veilig worden opgeslagen. Probeer het opnieuw.', 500)
  return Response.json({ ok: true, planId: String(createdPlanId) }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
