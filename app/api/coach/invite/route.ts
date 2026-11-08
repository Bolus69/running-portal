import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSameOriginRequest, jsonError } from '@/lib/http'

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Log opnieuw in om een atleet uit te nodigen.', 401)
  const { data: coachRole } = await supabase.from('coach_roles').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!coachRole) return jsonError('Alleen toegewezen coaches kunnen een atleet uitnodigen.', 403)

  let body: { email?: string; name?: string }
  try { body = await request.json() as { email?: string; name?: string } } catch { return jsonError('Controleer de uitnodigingsgegevens.', 400) }
  const email = String(body.email ?? '').trim().toLowerCase()
  const name = String(body.name ?? '').trim().slice(0, 120)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError('Vul een geldig e-mailadres in.', 400)
  let admin
  try { admin = createAdminSupabaseClient() } catch { return jsonError('De beveiligde uitnodigingsfunctie is nog niet ingesteld.', 503) }
  const requestOrigin = new URL(request.url).origin
  const configuredPreviewUrl = process.env.VERCEL_ENV === 'preview' ? process.env.NEXT_PUBLIC_APP_URL : undefined
  let callbackOrigin = requestOrigin
  if (configuredPreviewUrl) {
    try {
      const previewUrl = new URL(configuredPreviewUrl)
      if (previewUrl.protocol === 'https:') callbackOrigin = previewUrl.origin
    } catch {
      // Keep the request origin when the optional Preview URL is invalid.
    }
  }
  const callback = new URL('/auth/accept', callbackOrigin).toString()
  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: name }, redirectTo: callback })
  const athleteId = invitation.user?.id
  if (inviteError || !athleteId) return jsonError('De uitnodiging kon niet worden verstuurd. Controleer of het adres al een account heeft.', 409)

  const { error: profileError } = await admin.from('profiles').upsert({ id: athleteId, full_name: name || email.split('@')[0], role: 'athlete' }, { onConflict: 'id' })
  const { error: assignmentError } = await admin.from('coach_athletes').upsert({ coach_id: user.id, athlete_id: athleteId, status: 'active' }, { onConflict: 'coach_id,athlete_id' })
  if (profileError || assignmentError) return jsonError('De uitnodiging is verstuurd, maar de atleet kon niet automatisch aan jouw groep worden toegevoegd.', 500)
  await admin.from('audit_events').insert({ actor_id: user.id, athlete_id: athleteId, event_type: 'athlete_invited', object_type: 'coach_athlete', details: { email } })
  return Response.json({ ok: true }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
