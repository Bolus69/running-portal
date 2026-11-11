import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSameOriginRequest, jsonError } from '@/lib/http'
import { getStravaActivityCandidates, StravaLookupError } from '@/lib/strava'

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
  } catch (error) {
    const code = error instanceof StravaLookupError ? error.code : 'unknown'
    const status = error instanceof StravaLookupError ? error.status : undefined
    console.error('[strava:candidates] ophalen mislukt', { code, status })
    const messages: Record<string, string> = {
      configuration: 'Strava is tijdelijk niet beschikbaar door een app-instelling. Probeer het later opnieuw.',
      not_connected: 'Strava is niet gekoppeld aan dit atleetprofiel. Koppel Strava via Mijn profiel en probeer het opnieuw.',
      reconnect: 'Strava heeft de toegang geweigerd. Koppel Strava opnieuw via Mijn profiel en probeer het opnieuw.',
      permissions: 'Strava geeft geen toegang tot de activiteiten. Koppel Strava opnieuw en geef toestemming om activiteiten te bekijken.',
      rate_limit: 'Strava ontvangt te veel verzoeken. Wacht enkele minuten en probeer het opnieuw.',
      temporary: 'Strava is tijdelijk niet bereikbaar. Probeer het later opnieuw.',
      server: 'De activiteiten konden niet worden gecontroleerd. Probeer het opnieuw. Blijft dit gebeuren, laat het weten.',
      unknown: 'Strava-activiteiten konden niet worden opgehaald. Controleer je koppeling en probeer het opnieuw.',
    }
    const responseStatus = code === 'rate_limit' ? 429 : code === 'temporary' ? 503 : 502
    return jsonError(messages[code] ?? messages.unknown, responseStatus)
  }
}
