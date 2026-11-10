import { createHash } from 'node:crypto'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSameOriginRequest, jsonError } from '@/lib/http'
import { parseFitActivity } from '@/lib/activity-import'

const MAX_FILE_BYTES = 4 * 1024 * 1024
const VALID_EFFORTS = ['easier', 'as_expected', 'harder', 'not_good']

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Log opnieuw in om je training op te slaan.', 401)

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return jsonError('Het trainingsbestand kon niet worden gelezen.', 400)
  }

  const file = form.get('file')
  const plannedWorkoutId = form.get('plannedWorkoutId')
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.fit')) {
    return jsonError('Kies een FIT-bestand (.fit).', 400)
  }
  if (file.size === 0 || file.size > MAX_FILE_BYTES) {
    return jsonError('Het bestand moet kleiner zijn dan 4 MB.', 413)
  }
  if (typeof plannedWorkoutId !== 'string' || !plannedWorkoutId) {
    return jsonError('Koppel het bestand aan de training die je afrondt.', 400)
  }

  const { data: workout } = await supabase.from('planned_workouts')
    .select('id')
    .eq('id', plannedWorkoutId)
    .eq('athlete_id', user.id)
    .maybeSingle()
  if (!workout) return jsonError('Deze training hoort niet bij jouw schema.', 403)

  const bytes = new Uint8Array(await file.arrayBuffer())
  let imported: ReturnType<typeof parseFitActivity>
  try {
    imported = parseFitActivity(bytes)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Het trainingsbestand kon niet worden verwerkt.'
    return jsonError(message, 400)
  }

  if (imported.durationMinutes > 1800 || (imported.distanceKm !== undefined && imported.distanceKm > 500)) {
    return jsonError('De duur of afstand in dit bestand lijkt niet te kloppen.', 400)
  }

  const effortValue = form.get('effort')
  const effort = typeof effortValue === 'string' && VALID_EFFORTS.includes(effortValue) ? effortValue : undefined
  const noteValue = form.get('note')
  const note = typeof noteValue === 'string' ? noteValue.trim().slice(0, 200) : undefined
  const uploadHash = createHash('sha256').update(bytes).digest('hex')
  const rawSummary = { import_source: 'fit', upload_hash: uploadHash, effort, note }
  const activityValues = {
    name: 'Hardlooptraining',
    activity_type: 'Run',
    started_at: imported.startedAt,
    elapsed_seconds: Math.round(imported.durationMinutes * 60),
    moving_seconds: Math.round(imported.movingDurationMinutes * 60),
    distance_meters: imported.distanceKm ? Math.round(imported.distanceKm * 1000) : null,
    average_speed_mps: imported.distanceKm ? imported.distanceKm * 1000 / (imported.movingDurationMinutes * 60) : null,
    average_heart_rate: imported.averageHeartRate && imported.averageHeartRate <= 240 ? imported.averageHeartRate : null,
    raw_summary: rawSummary,
  }

  let activityId: string | undefined
  let isRetry = false
  const { data: existing } = await supabase.from('activities')
    .select('id')
    .eq('athlete_id', user.id)
    .eq('source', 'manual')
    .contains('raw_summary', { upload_hash: uploadHash })
    .maybeSingle()

  if (existing) {
    const { data: existingLinks } = await supabase.from('activity_workout_links')
      .select('planned_workout_id')
      .eq('activity_id', existing.id)
    if (existingLinks?.some((link) => link.planned_workout_id !== plannedWorkoutId)) {
      return jsonError('Dit bestand is al aan een andere training gekoppeld.', 409)
    }
    const { data: updated, error } = await supabase.from('activities')
      .update(activityValues)
      .eq('id', existing.id)
      .eq('athlete_id', user.id)
      .select('id')
      .single()
    if (error || !updated) return jsonError('De bestaande activiteit kon niet worden bijgewerkt.', 500)
    activityId = String(updated.id)
    isRetry = true
  } else {
    const { data: inserted, error } = await supabase.from('activities')
      .insert({ athlete_id: user.id, source: 'manual', ...activityValues })
      .select('id')
      .single()
    if (error || !inserted) return jsonError('De training kon niet worden opgeslagen.', 500)
    activityId = String(inserted.id)
  }

  const warnings: string[] = []
  if (imported.laps.length) {
    const { data: existingLaps } = await supabase.from('activity_laps').select('lap_order').eq('activity_id', activityId)
    const existingLapOrders = new Set((existingLaps ?? []).map((lap) => Number(lap.lap_order)))
    const lapRows = imported.laps.map((lap, index) => ({
      activity_id: activityId,
      lap_order: index + 1,
      label: lap.label.slice(0, 50),
      elapsed_seconds: lap.durationMinutes ? Math.round(lap.durationMinutes * 60) : null,
      distance_meters: lap.distanceKm ? Math.round(lap.distanceKm * 1000) : null,
      average_speed_mps: lap.distanceKm && lap.movingDurationMinutes ? lap.distanceKm * 1000 / (lap.movingDurationMinutes * 60) : null,
      average_heart_rate: lap.averageHeartRate && lap.averageHeartRate <= 240 ? lap.averageHeartRate : null,
    })).filter((lap) => !existingLapOrders.has(lap.lap_order) && (lap.elapsed_seconds || lap.distance_meters || lap.average_speed_mps || lap.average_heart_rate))
    if (lapRows.length) {
      const { error } = await supabase.from('activity_laps').insert(lapRows)
      if (error) warnings.push('De activiteit is opgeslagen, maar de blokgegevens konden niet worden opgeslagen.')
    }
  }

  const { error: linkError } = await supabase.from('activity_workout_links').insert({
    activity_id: activityId,
    planned_workout_id: plannedWorkoutId,
    match_method: 'manual',
    confidence: 1,
  })
  let linked = !linkError
  if (linkError) {
    const { data: existingLink } = await supabase.from('activity_workout_links')
      .select('id')
      .eq('activity_id', activityId)
      .eq('planned_workout_id', plannedWorkoutId)
      .maybeSingle()
    linked = Boolean(existingLink)
    if (!linked) warnings.push('De activiteit is opgeslagen, maar kon niet aan de training worden gekoppeld.')
  }

  if (linked) {
    const { error } = await supabase.from('workout_feedback').upsert({
      planned_workout_id: plannedWorkoutId,
      athlete_id: user.id,
      activity_id: activityId,
      state: 'completed',
      effort: effort ?? null,
      note: note || null,
      completed_at: imported.startedAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'planned_workout_id,athlete_id' })
    if (error) warnings.push('De activiteit is gekoppeld, maar de feedback kon niet worden bijgewerkt.')
  }

  return Response.json({
    ok: true,
    activityId,
    warning: warnings.length ? warnings.join(' ') : undefined,
  }, { status: isRetry ? 200 : 201, headers: { 'Cache-Control': 'no-store' } })
}
