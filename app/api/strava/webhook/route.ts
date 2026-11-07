import { after } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { processStravaWebhook, type StravaWebhookPayload } from '@/lib/strava'

export const maxDuration = 30

function webhookSecret(): string {
  return process.env.STRAVA_WEBHOOK_SECRET ?? ''
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const verifyToken = url.searchParams.get('hub.verify_token') ?? ''
  const challenge = url.searchParams.get('hub.challenge')
  if (!webhookSecret() || verifyToken !== webhookSecret() || !challenge) return Response.json({ error: 'Verification failed' }, { status: 403 })
  return Response.json({ 'hub.challenge': challenge }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  if (!webhookSecret() || url.searchParams.get('token') !== webhookSecret()) return Response.json({ error: 'Not authorised' }, { status: 403 })
  let payload: StravaWebhookPayload
  try { payload = await request.json() as StravaWebhookPayload } catch { return Response.json({ error: 'Invalid event' }, { status: 400 }) }
  if (!payload || !['activity', 'athlete'].includes(payload.object_type) || !['create', 'update', 'delete'].includes(payload.aspect_type) || !Number.isFinite(payload.object_id) || !Number.isFinite(payload.owner_id)) return Response.json({ error: 'Invalid event' }, { status: 400 })
  const admin = createAdminSupabaseClient()
  const eventKey = [payload.subscription_id ?? 0, payload.event_time ?? 0, payload.object_id, payload.aspect_type].join(':')
  const { error } = await admin.from('strava_webhook_events').upsert({
    event_key: eventKey,
    strava_athlete_id: payload.owner_id,
    event_payload: payload,
    processing_state: 'queued',
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (error) return Response.json({ error: 'Event could not be queued' }, { status: 503 })

  after(async () => {
    const { data: event } = await admin.from('strava_webhook_events').select('id,processing_state').eq('event_key', eventKey).maybeSingle()
    if (!event || event.processing_state !== 'queued') return
    try {
      await processStravaWebhook(admin, payload)
      await admin.from('strava_webhook_events').update({ processing_state: 'processed', processed_at: new Date().toISOString(), error_summary: null }).eq('id', event.id)
    } catch {
      await admin.from('strava_webhook_events').update({ processing_state: 'failed', error_summary: 'Activity could not be synchronized.' }).eq('id', event.id)
    }
  })
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
