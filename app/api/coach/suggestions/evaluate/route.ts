import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSameOriginRequest, jsonError } from '@/lib/http'

type Row = Record<string, unknown>
type Workout = { id: string; workout_type: string; workout_date: string; state: string; duration_minutes: number | null; distance_km: number | null; description: string }

function makeWorkoutChange(workout: Workout, reduction: number, note: string) {
  const change: Record<string, string | number> = {
    description: (workout.description ? workout.description + ' ' : '') + note,
  }
  if (typeof workout.duration_minutes === 'number' && workout.duration_minutes > 0) {
    change.duration_minutes = Math.max(20, Math.round(workout.duration_minutes * (1 - reduction)))
  } else if (typeof workout.distance_km === 'number' && workout.distance_km > 0) {
    change.distance_km = Math.round(workout.distance_km * (1 - reduction) * 10) / 10
  }
  return change
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Log opnieuw in om voorstellen te controleren.', 401)
  const { data: coachRole } = await supabase.from('coach_roles').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!coachRole) return jsonError('Alleen een coach kan voorstellen controleren.', 403)

  const { data: relationshipData, error: relationshipError } = await supabase.from('coach_athletes').select('athlete_id').eq('coach_id', user.id).eq('status', 'active').limit(50)
  if (relationshipError) return jsonError('De gekoppelde atleten konden niet worden opgehaald.', 500)
  const athleteIds = [...new Set(((relationshipData ?? []) as unknown as Row[]).map((row) => String(row.athlete_id)))]
  if (!athleteIds.length) return Response.json({ ok: true, created: 0 }, { headers: { 'Cache-Control': 'no-store' } })

  let admin
  try { admin = createAdminSupabaseClient() } catch { return jsonError('De beveiligde serverkoppeling is niet ingesteld.', 503) }

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const horizon = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: existingData, error: existingError } = await supabase.from('coach_suggestions').select('athlete_id,planned_workout_id,created_at').eq('coach_id', user.id).gte('created_at', since).limit(200)
  if (existingError) return jsonError('Bestaande coachvoorstellen konden niet worden gecontroleerd.', 500)
  const existing = (existingData ?? []) as unknown as Row[]
  let created = 0

  for (const athleteId of athleteIds) {
    const { data: plan, error: planError } = await supabase.from('training_plans').select('id').eq('athlete_id', athleteId).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (planError || !plan) continue
    const { data: workoutData, error: workoutError } = await supabase.from('planned_workouts').select('id,workout_type,workout_date,state,duration_minutes,distance_km,description').eq('plan_id', String(plan.id)).order('workout_date')
    if (workoutError) continue
    const workouts = (workoutData ?? []) as unknown as Workout[]
    if (!workouts.length) continue
    const workoutIds = workouts.map((workout) => workout.id)
    const { data: feedbackData, error: feedbackError } = await supabase.from('workout_feedback').select('planned_workout_id,state,effort,completed_at').eq('athlete_id', athleteId).eq('state', 'completed').gte('completed_at', since).in('planned_workout_id', workoutIds)
    if (feedbackError) continue
    const feedback = (feedbackData ?? []) as unknown as Row[]
    const completedIds = new Set(feedback.map((item) => String(item.planned_workout_id)))
    const upcoming = workouts.filter((workout) => workout.workout_date >= today && workout.workout_date <= horizon && workout.state !== 'skipped' && !completedIds.has(workout.id))
    const missed = workouts.filter((workout) => workout.workout_date < today && (workout.state === 'planned' || workout.state === 'adjusted') && !completedIds.has(workout.id))
    const missedLong = missed.find((workout) => workout.workout_type === 'long')
    let target: Workout | undefined
    let title = ''
    let reason = ''
    let suggestedChange: Record<string, string | number> = {}

    if (missedLong) {
      target = upcoming.find((workout) => workout.workout_type === 'long')
      if (!target) continue
      title = 'Gemiste lange duurloop niet compenseren'
      reason = 'De geplande lange duurloop staat nog open. Bespreek of de atleet het schema volgens planning kan voortzetten; extra kilometers toevoegen is niet nodig.'
      suggestedChange = { description: (target.description ? target.description + ' ' : '') + 'Coachvoorstel: voer deze duurloop uit zoals gepland en voeg geen kilometers toe om een gemiste training te compenseren.' }
    } else if (missed.length) {
      target = upcoming[0]
      if (!target) continue
      title = 'Gemiste training niet inhalen'
      reason = 'Er staat een training open na de geplande datum. Een gemiste sessie hoeft niet automatisch te worden ingehaald; bespreek of de atleet de planning kan hervatten.'
      suggestedChange = { description: (target.description ? target.description + ' ' : '') + 'Coachvoorstel: hervat de planning en voeg geen extra training toe om een gemiste sessie te compenseren.' }
    } else {
      const heavyCount = feedback.filter((item) => item.effort === 'harder' || item.effort === 'not_good').length
      if (!heavyCount) continue
      target = upcoming.find((workout) => workout.workout_type === 'quality')
      if (!target) continue
      const reduction = heavyCount >= 2 ? 0.25 : 0.15
      title = heavyCount >= 2 ? 'Voorstel voor een lichtere kwaliteitstraining' : 'Kwaliteitstraining iets inkorten'
      reason = heavyCount >= 2 ? 'Meerdere recente trainingen voelden zwaarder dan verwacht. Een lichtere kwaliteitstraining is het bespreken waard.' : 'De laatste training voelde zwaarder dan verwacht. Bespreek of de volgende kwaliteitstraining iets korter kan.'
      suggestedChange = makeWorkoutChange(target, reduction, heavyCount >= 2 ? 'Coachvoorstel: verkort het werk met ongeveer 25% en houd de inspanning gecontroleerd.' : 'Coachvoorstel: verkort het werk met ongeveer 15% en houd de inspanning gecontroleerd.')
    }

    const alreadySuggested = existing.some((item) => String(item.athlete_id) === athleteId && String(item.planned_workout_id ?? '') === target?.id)
    if (alreadySuggested || !target) continue
    const { data: inserted, error } = await admin.from('coach_suggestions').insert({
      coach_id: user.id,
      athlete_id: athleteId,
      planned_workout_id: target.id,
      title,
      reason,
      suggested_change: suggestedChange,
    }).select('id').single()
    if (error || !inserted) continue
    await admin.from('audit_events').insert({ actor_id: user.id, athlete_id: athleteId, event_type: 'coach_suggestion_generated', object_type: 'coach_suggestion', object_id: inserted.id, details: { planned_workout_id: target.id, title } })
    existing.push({ athlete_id: athleteId, planned_workout_id: target.id, created_at: now.toISOString() })
    created += 1
  }

  return Response.json({ ok: true, created }, { headers: { 'Cache-Control': 'no-store' } })
}
