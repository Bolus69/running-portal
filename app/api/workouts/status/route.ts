import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSameOriginRequest, jsonError } from '@/lib/http'

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Log opnieuw in om je training bij te werken.', 401)
  let body: { workoutId?: string; status?: string }
  try { body = await request.json() as { workoutId?: string; status?: string } } catch { return jsonError('Ongeldig verzoek.', 400) }
  if (!body.workoutId || (body.status !== 'completed' && body.status !== 'skipped')) return jsonError('Ongeldige trainingsstatus.', 400)
  const { data: workout } = await supabase.from('planned_workouts').select('id,athlete_id').eq('id', body.workoutId).eq('athlete_id', user.id).maybeSingle()
  if (!workout) return jsonError('Deze training hoort niet bij jouw schema.', 403)
  const { error } = await supabase.from('workout_feedback').upsert({
    planned_workout_id: body.workoutId,
    athlete_id: user.id,
    state: body.status,
    completed_at: body.status === 'completed' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'planned_workout_id,athlete_id' })
  if (error) return jsonError('De trainingsstatus kon niet worden opgeslagen.', 500)
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
