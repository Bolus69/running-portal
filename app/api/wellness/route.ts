import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSameOriginRequest, jsonError } from '@/lib/http'

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Log opnieuw in om je gegevens op te slaan.', 401)
  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> } catch { return jsonError('Ongeldige gegevens.', 400) }
  const sleep = body.sleepHours === '' || body.sleepHours === undefined ? null : Number(body.sleepHours)
  const heartRate = body.restingHeartRate === '' || body.restingHeartRate === undefined ? null : Number(body.restingHeartRate)
  const recovery = body.recoveryScore === '' || body.recoveryScore === undefined ? null : Number(body.recoveryScore)
  if ((sleep !== null && (!Number.isFinite(sleep) || sleep < 0 || sleep > 24)) || (heartRate !== null && (!Number.isInteger(heartRate) || heartRate < 25 || heartRate > 220)) || (recovery !== null && (!Number.isInteger(recovery) || recovery < 1 || recovery > 5))) return jsonError('Controleer de herstelgegevens.', 400)
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''
  const { error } = await supabase.from('wellness_entries').upsert({
    athlete_id: user.id,
    entry_date: new Date().toISOString().slice(0, 10),
    sleep_hours: sleep,
    resting_heart_rate: heartRate,
    recovery_score: recovery,
    note: note || null,
    visible_to_coach: body.visibleToCoach !== false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'athlete_id,entry_date' })
  if (error) return jsonError('De herstelgegevens konden niet worden opgeslagen.', 500)
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
