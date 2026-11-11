import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSameOriginRequest, jsonError } from '@/lib/http'
import { attachStravaActivityToWorkout } from '@/lib/strava'

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Log opnieuw in om je Strava-activiteit te koppelen.', 401)

  let body: { plannedWorkoutId?: string; activityId?: string }
  try {
    body = await request.json() as { plannedWorkoutId?: string; activityId?: string }
  } catch {
    return jsonError('Ongeldig verzoek.', 400)
  }
  if (typeof body.plannedWorkoutId !== 'string' || !body.plannedWorkoutId || typeof body.activityId !== 'string' || !/^\d{1,20}$/.test(body.activityId)) {
    return jsonError('Kies een geldige Strava-activiteit en training.', 400)
  }

  const { data: workout } = await supabase.from('planned_workouts')
    .select('id,workout_date')
    .eq('id', body.plannedWorkoutId)
    .eq('athlete_id', user.id)
    .maybeSingle()
  if (!workout) return jsonError('Deze training hoort niet bij jouw schema.', 403)

  try {
    await attachStravaActivityToWorkout(createAdminSupabaseClient(), user.id, String(workout.id), String(workout.workout_date), body.activityId)
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('al aan een andere training')) return jsonError(message, 409)
    if (message.includes('al een andere activiteit')) return jsonError(message, 409)
    if (message.includes('niet meer beschikbaar') || message.includes('past niet bij')) return jsonError(message, 400)
    return jsonError('De Strava-activiteit kon niet worden gekoppeld. Controleer je koppeling en probeer het opnieuw.', 502)
  }
}
