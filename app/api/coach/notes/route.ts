import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSameOriginRequest, jsonError } from '@/lib/http'

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Log opnieuw in om een notitie op te slaan.', 401)

  let body: { athleteId?: string; note?: string }
  try { body = await request.json() as { athleteId?: string; note?: string } } catch { return jsonError('Ongeldige notitie.', 400) }
  const athleteId = typeof body.athleteId === 'string' ? body.athleteId : ''
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : ''
  if (!athleteId || !note) return jsonError('Vul een korte notitie in.', 400)

  const { data: relationship } = await supabase.from('coach_athletes').select('athlete_id').eq('coach_id', user.id).eq('athlete_id', athleteId).eq('status', 'active').maybeSingle()
  if (!relationship) return jsonError('Deze atleet is niet aan jouw coachaccount gekoppeld.', 403)

  const { data: saved, error } = await supabase.from('coach_notes').insert({ coach_id: user.id, athlete_id: athleteId, note }).select('id,note,created_at').single()
  if (error || !saved) return jsonError('De coachnotitie kon niet worden opgeslagen.', 500)
  return Response.json({ ok: true, note: { id: saved.id, note: saved.note, createdAt: saved.created_at } }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
}
