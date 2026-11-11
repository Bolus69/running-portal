import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSameOriginRequest, jsonError } from '@/lib/http'
import { getStravaActivityCandidates } from '@/lib/strava'

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Log opnieuw in om Strava-activiteiten te zoeken.', 401)

  let body: { plannedWorkoutId?: string }
  try {
    body = await request.json() as { plannedWorkoutId?: string }
  } catch {
    return jsonError('Ongeldig verzoek.', 400)
  }
  if (!body.plannedWorkoutId || typeof body.plannedWorkoutId !== 'string') return jsonError('Kies eerst een training.', 400)

  const { data: workout } = await supabase.from('planned_workouts')
    .select('id,workout_date')
    .eq('id', body.plannedWorkoutId)
    .eq('athlete_id', user.id)
    .maybeSingle()
  if (!workout) return jsonError('Deze training hoort niet bij jouw schema.', 403)

  try {
    const candidates = await getStravaActivityCandidates(createAdminSupabaseClient(), user.id, String(workout.id), String(workout.workout_date))
    return Response.json({ ok: true, candidates }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return jsonError('Strava-activiteiten konden niet worden opgehaald. Controleer je koppeling en probeer het opnieuw.', 502)
  }
}
