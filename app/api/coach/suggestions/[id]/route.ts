import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSameOriginRequest, jsonError } from '@/lib/http'

type Row = Record<string, unknown>
const EDITABLE_FIELDS = ['title', 'description', 'duration_minutes', 'distance_km', 'intensity'] as const

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Log opnieuw in om een voorstel te beoordelen.', 401)
  const { id } = await context.params
  let body: { status?: string; change?: string }
  try { body = await request.json() as { status?: string; change?: string } } catch { return jsonError('Ongeldig verzoek.', 400) }
  if (!['accepted', 'modified', 'rejected'].includes(String(body.status))) return jsonError('Ongeldige beoordeling.', 400)
  const status = body.status as 'accepted' | 'modified' | 'rejected'
  if (status === 'modified' && !String(body.change ?? '').trim()) return jsonError('Beschrijf eerst de aangepaste training.', 400)
  const { data: coachRole } = await supabase.from('coach_roles').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!coachRole) return jsonError('Alleen een coach kan dit voorstel beoordelen.', 403)
  const { data: suggestionData } = await supabase.from('coach_suggestions').select('*').eq('id', id).eq('coach_id', user.id).maybeSingle()
  if (!suggestionData) return jsonError('Dit voorstel is niet aan jou toegewezen.', 404)
  const suggestion = suggestionData as unknown as Row
  const athleteId = String(suggestion.athlete_id)
  const { data: assignment } = await supabase.from('coach_athletes').select('athlete_id').eq('coach_id', user.id).eq('athlete_id', athleteId).eq('status', 'active').maybeSingle()
  if (!assignment) return jsonError('Deze atleet is niet aan jou toegewezen.', 403)

  let admin
  try { admin = createAdminSupabaseClient() } catch { return jsonError('De beveiligde serverkoppeling is niet ingesteld.', 503) }
  const workoutId = typeof suggestion.planned_workout_id === 'string' ? suggestion.planned_workout_id : null
  let originalWorkout: Row = {}
  let updatedWorkout: Row = {}
  if (status !== 'rejected' && workoutId) {
    const { data: workout } = await admin.from('planned_workouts').select('*').eq('id', workoutId).eq('athlete_id', athleteId).maybeSingle()
    if (!workout) return jsonError('De bijbehorende training kan niet meer worden gevonden.', 404)
    originalWorkout = workout as unknown as Row
    const rawSuggested = (suggestion.suggested_change && typeof suggestion.suggested_change === 'object' ? suggestion.suggested_change : {}) as Row
    const changes: Record<string, unknown> = {}
    if (status === 'accepted') {
      for (const key of EDITABLE_FIELDS) if (rawSuggested[key] !== undefined) changes[key] = rawSuggested[key]
    }
    if (status === 'modified') {
      changes.description = String(body.change).trim().slice(0, 500)
    }
    if (Object.keys(changes).length) {
      const { data: updated, error } = await admin.from('planned_workouts').update({ ...changes, state: 'adjusted', updated_at: new Date().toISOString() }).eq('id', workoutId).select('*').single()
      if (error || !updated) return jsonError('De trainingswijziging kon niet worden opgeslagen.', 500)
      updatedWorkout = updated as unknown as Row
      await admin.from('coach_changes').insert({ coach_id: user.id, athlete_id: athleteId, planned_workout_id: workoutId, suggestion_id: id, original_workout: originalWorkout, updated_workout: updatedWorkout, reason: String(suggestion.reason) })
    }
  }

  const now = new Date().toISOString()
  const coachChange = status === 'modified' ? { description: String(body.change).trim().slice(0, 500) } : status === 'accepted' ? suggestion.suggested_change : {}
  const { error: suggestionError } = await admin.from('coach_suggestions').update({ state: status, coach_change: coachChange, reviewed_at: now, updated_at: now }).eq('id', id).eq('coach_id', user.id)
  if (suggestionError) return jsonError('Het voorstel kon niet worden bijgewerkt.', 500)
  await admin.from('audit_events').insert({ actor_id: user.id, athlete_id: athleteId, event_type: 'coach_suggestion_' + status, object_type: 'coach_suggestion', object_id: id, details: { planned_workout_id: workoutId } })
  return Response.json({ ok: true, state: status }, { headers: { 'Cache-Control': 'no-store' } })
}
