import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSameOriginRequest, jsonError } from '@/lib/http'
import { parseDurationToSeconds } from '@/lib/training-plan'

type ManualLap = { label?: string; durationMinutes?: number; distanceKm?: number; pace?: string; averageHeartRate?: number }

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Log opnieuw in om je training op te slaan.', 401)
  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> } catch { return jsonError('Ongeldige trainingsgegevens.', 400) }
  const durationMinutes = Number(body.durationMinutes)
  const distanceKm = Number(body.distanceKm)
  const startedAt = typeof body.startedAt === 'string' ? new Date(body.startedAt) : new Date()
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1800 || Number.isNaN(startedAt.getTime())) return jsonError('Vul een geldige datum en trainingsduur in.', 400)
  const validEfforts = ['easier', 'as_expected', 'harder', 'not_good']
  const effort = validEfforts.includes(String(body.effort)) ? String(body.effort) : undefined
  const note = typeof body.note === 'string' ? body.note.slice(0, 1000) : undefined
  const averageHeartRate = Number(body.averageHeartRate)
  const plannedWorkoutId = typeof body.plannedWorkoutId === 'string' && body.plannedWorkoutId ? body.plannedWorkoutId : undefined
  if (plannedWorkoutId) {
    const { data: workout } = await supabase.from('planned_workouts').select('id').eq('id', plannedWorkoutId).eq('athlete_id', user.id).maybeSingle()
    if (!workout) return jsonError('Deze training hoort niet bij jouw schema.', 403)
  }
  const distanceMeters = Number.isFinite(distanceKm) && distanceKm > 0 ? Math.round(distanceKm * 1000) : null
  const speed = distanceMeters ? distanceMeters / (durationMinutes * 60) : null
  const { data: inserted, error } = await supabase.from('activities').insert({
    athlete_id: user.id,
    source: 'manual',
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : 'Hardlooptraining',
    activity_type: 'Run',
    started_at: startedAt.toISOString(),
    elapsed_seconds: Math.round(durationMinutes * 60),
    moving_seconds: Math.round(durationMinutes * 60),
    distance_meters: distanceMeters,
    average_speed_mps: speed,
    average_heart_rate: Number.isFinite(averageHeartRate) && averageHeartRate > 0 ? averageHeartRate : null,
    raw_summary: { effort, note },
  }).select('id').single()
  if (error || !inserted) return jsonError('De training kon niet worden opgeslagen.', 500)

  const laps = Array.isArray(body.laps) ? body.laps.slice(0, 20) as ManualLap[] : []
  const lapRows = laps.map((lap, index) => {
    const lapDuration = Number(lap.durationMinutes)
    const lapDistance = Number(lap.distanceKm)
    const paceSeconds = typeof lap.pace === 'string' ? parseDurationToSeconds(lap.pace) : null
    const paceSpeed = paceSeconds && paceSeconds > 0 ? 1000 / paceSeconds : null
    const lapSpeed = paceSpeed ?? (lapDistance > 0 && lapDuration > 0 ? lapDistance * 1000 / (lapDuration * 60) : null)
    return {
      activity_id: String(inserted.id),
      lap_order: index + 1,
      label: typeof lap.label === 'string' ? lap.label.slice(0, 50) : 'Blok ' + (index + 1),
      elapsed_seconds: Number.isFinite(lapDuration) && lapDuration > 0 ? Math.round(lapDuration * 60) : null,
      distance_meters: Number.isFinite(lapDistance) && lapDistance > 0 ? Math.round(lapDistance * 1000) : null,
      average_speed_mps: lapSpeed,
      average_heart_rate: Number.isFinite(Number(lap.averageHeartRate)) && Number(lap.averageHeartRate) > 0 ? Number(lap.averageHeartRate) : null,
    }
  }).filter((lap) => lap.elapsed_seconds || lap.distance_meters || lap.average_speed_mps || lap.average_heart_rate)
  if (lapRows.length) await supabase.from('activity_laps').insert(lapRows)

  let warning: string | undefined
  if (plannedWorkoutId) {
    const { error: linkError } = await supabase.from('activity_workout_links').insert({ activity_id: String(inserted.id), planned_workout_id: plannedWorkoutId, match_method: 'manual', confidence: 1 })
    if (linkError) {
      warning = 'Training opgeslagen, maar koppelen aan het schema lukte niet.'
    } else {
      const { error: feedbackError } = await supabase.from('workout_feedback').upsert({
        planned_workout_id: plannedWorkoutId,
        athlete_id: user.id,
        activity_id: String(inserted.id),
        state: 'completed',
        effort: effort ?? null,
        note: note ?? null,
        completed_at: startedAt.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'planned_workout_id,athlete_id' })
      if (feedbackError) warning = 'Training en koppeling opgeslagen, maar de status van de geplande training kon niet worden bijgewerkt.'
    }
  }
  return Response.json({ ok: true, activityId: inserted.id, warning }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
