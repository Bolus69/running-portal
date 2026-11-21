import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSameOriginRequest, jsonError } from '@/lib/http'
import { decryptStravaToken } from '@/lib/strava'

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Log opnieuw in om de Strava-koppeling te beheren.', 401)
  const admin = createAdminSupabaseClient()
  const { data: connection } = await admin.from('strava_connections').select('access_token_enc').eq('athlete_id', user.id).eq('is_active', true).maybeSingle()
  if (!connection) return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  try {
    const accessToken = decryptStravaToken(String(connection.access_token_enc))
    await fetch('https://www.strava.com/oauth/deauthorize?access_token=' + encodeURIComponent(accessToken), { method: 'POST', cache: 'no-store' })
  } catch {
    // The app still removes its local credentials if Strava is unavailable.
  }
  const now = new Date().toISOString()
  const { error } = await admin.from('strava_connections').update({ access_token_enc: '', refresh_token_enc: '', is_active: false, revoked_at: now, updated_at: now }).eq('athlete_id', user.id)
  if (error) return jsonError('De lokale koppeling kon niet worden verwijderd.', 500)
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
