import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { decryptStravaToken } from '@/lib/strava'
import { isSameOriginRequest, jsonError } from '@/lib/http'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)

  const { id: athleteId } = await context.params
  if (!UUID_PATTERN.test(athleteId)) return jsonError('Deze atleet is niet gevonden.', 404)

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonError('Log opnieuw in om een atleet te verwijderen.', 401)

  const { data: coachProfile, error: coachProfileError } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (coachProfileError) return jsonError('Je coachrechten konden niet worden gecontroleerd. Probeer het later opnieuw.', 503)
  if (coachProfile?.role !== 'coach') return jsonError('Alleen coaches kunnen een atleet verwijderen.', 403)
  if (athleteId === user.id) return jsonError('Je kunt je eigen coachaccount niet via deze functie verwijderen.', 403)

  let body: { confirmName?: string }
  try {
    body = await request.json() as { confirmName?: string }
  } catch {
    return jsonError('Bevestig de verwijdering door de naam van de atleet in te vullen.', 400)
  }

  let admin
  try {
    admin = createAdminSupabaseClient()
  } catch {
    return jsonError('De beveiligde verwijderfunctie is nog niet ingesteld.', 503)
  }

  const [{ data: assignment, error: assignmentError }, { data: athlete, error: athleteError }] = await Promise.all([
    admin.from('coach_athletes').select('athlete_id').eq('coach_id', user.id).eq('athlete_id', athleteId).eq('status', 'active').maybeSingle(),
    admin.from('profiles').select('id,full_name,role').eq('id', athleteId).maybeSingle(),
  ])
  if (assignmentError || athleteError) return jsonError('De atleet kon niet veilig worden gecontroleerd. Probeer het opnieuw.', 503)
  if (!assignment || !athlete || athlete.role !== 'athlete') return jsonError('Deze atleet is niet aan jouw coachaccount toegewezen.', 404)

  const athleteName = String(athlete.full_name || 'Atleet').trim()
  if (typeof body.confirmName !== 'string' || body.confirmName.trim() !== athleteName) {
    return jsonError('De bevestigingsnaam komt niet overeen. Er is niets verwijderd.', 400)
  }

  const { data: connection, error: connectionError } = await admin
    .from('strava_connections')
    .select('strava_athlete_id,refresh_token_enc,is_active')
    .eq('athlete_id', athleteId)
    .maybeSingle()
  if (connectionError) return jsonError('De Strava-koppeling kon niet worden gecontroleerd. Er is niets verwijderd.', 503)

  if (connection?.is_active) {
    const clientId = process.env.STRAVA_CLIENT_ID
    const clientSecret = process.env.STRAVA_CLIENT_SECRET
    if (!clientId || !clientSecret) return jsonError('De Strava-koppeling kon niet veilig worden ingetrokken. Er is niets verwijderd.', 503)

    let refreshToken = ''
    try {
      refreshToken = decryptStravaToken(String(connection.refresh_token_enc))
    } catch {
      return jsonError('De Strava-koppeling kon niet veilig worden ingetrokken. Er is niets verwijderd.', 503)
    }

    try {
      const revokeResponse = await fetch('https://www.strava.com/oauth/revoke', {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token' }),
        cache: 'no-store',
      })
      if (!revokeResponse.ok) return jsonError('Strava kon de koppeling niet intrekken. Er is nog niets verwijderd; probeer het later opnieuw.', 502)
    } catch {
      return jsonError('Strava kon de koppeling niet bereiken. Er is nog niets verwijderd; probeer het later opnieuw.', 502)
    }
  }

  if (connection?.strava_athlete_id) {
    const { error: webhookDeleteError } = await admin.from('strava_webhook_events').delete().eq('strava_athlete_id', connection.strava_athlete_id)
    if (webhookDeleteError) return jsonError('Strava-gebeurtenissen konden niet worden verwijderd. Je atleetaccount is nog actief; probeer het opnieuw.', 500)
  }

  const { error: auditDeleteError } = await admin
    .from('audit_events')
    .delete()
    .or('actor_id.eq.' + athleteId + ',athlete_id.eq.' + athleteId)
  if (auditDeleteError) return jsonError('De gegevensregistratie kon niet worden opgeschoond. Je atleetaccount is nog actief; probeer het opnieuw.', 500)

  const { error: deleteUserError } = await admin.auth.admin.deleteUser(athleteId)
  if (deleteUserError) return jsonError('Het atleetaccount kon niet worden verwijderd. Probeer het opnieuw; controleer daarna of de atleet nog in je lijst staat.', 500)

  const { error: auditInsertError } = await admin.from('audit_events').insert({
    actor_id: user.id,
    athlete_id: null,
    event_type: 'athlete_deleted',
    object_type: 'athlete',
    details: {},
  })

  return Response.json({ ok: true, auditRecorded: !auditInsertError }, { headers: { 'Cache-Control': 'no-store' } })
}
