import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSameOriginRequest, jsonError } from '@/lib/http'
import { syncStravaActivities } from '@/lib/strava'

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Log opnieuw in om Strava te synchroniseren.', 401)
  try {
    const admin = createAdminSupabaseClient()
    const count = await syncStravaActivities(admin, user.id)
    return Response.json({ ok: true, imported: count }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return jsonError('Strava kon nu niet worden gesynchroniseerd. Je bestaande trainingsgeschiedenis blijft beschikbaar.', 502)
  }
}
