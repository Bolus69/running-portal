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

  const lapRows = imported.laps.map((lap, index) => ({
    lap_order: index + 1,
    label: lap.label.slice(0, 50),
    elapsed_seconds: lap.durationMinutes ? Math.round(lap.durationMinutes * 60) : null,
    distance_meters: lap.distanceKm ? Math.round(lap.distanceKm * 1000) : null,
    average_speed_mps: lap.distanceKm && lap.movingDurationMinutes ? lap.distanceKm * 1000 / (lap.movingDurationMinutes * 60) : null,
    average_heart_rate: lap.averageHeartRate && lap.averageHeartRate <= 240 ? lap.averageHeartRate : null,
  })).filter((lap) => lap.elapsed_seconds || lap.distance_meters || lap.average_speed_mps || lap.average_heart_rate)

  const { data, error } = await supabase.rpc('import_fit_workout', {
    p_workout_id: plannedWorkoutId,
    p_activity: activityValues,
    p_laps: lapRows,
  })
  if (error) {
    if (error.code === '23505') return jsonError('Dit bestand is al aan een andere training gekoppeld.', 409)
    if (error.code === '42501') return jsonError('Deze training hoort niet bij jouw schema.', 403)
    return jsonError('De training kon niet worden opgeslagen. Probeer het opnieuw.', 500)
  }
  return Response.json({ ok: true, activityId: data.activityId }, {
    status: data.isRetry ? 200 : 201,
    headers: { 'Cache-Control': 'no-store' },
  })
}
