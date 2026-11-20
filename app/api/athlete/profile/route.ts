import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSameOriginRequest, jsonError } from '@/lib/http'

type Preferences = Record<string, unknown>

function objectValue(value: unknown): Preferences {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Preferences : {}
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)

  const supabase = await createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonError('Log opnieuw in om je gegevens op te slaan.', 401)

  let body: { name?: unknown; age?: unknown }
  try { body = await request.json() as { name?: unknown; age?: unknown } } catch { return jsonError('Controleer de ingevulde gegevens.', 400) }
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 80) return jsonError('Vul een naam in van maximaal 80 tekens.', 400)

  let age: number | null = null
  if (body.age !== undefined && body.age !== null && body.age !== '') {
    const parsedAge = typeof body.age === 'number' || typeof body.age === 'string' ? Number(body.age) : Number.NaN
    if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120) return jsonError('Vul een leeftijd tussen 1 en 120 jaar in, of laat het veld leeg.', 400)
    age = parsedAge
  }

  const { data: profile, error: profileError } = await supabase.from('profiles').select('id,role,preferences').eq('id', user.id).maybeSingle()
  if (profileError) return jsonError('Je profiel kon niet worden gecontroleerd. Probeer het later opnieuw.', 503)
  if (profile?.role !== 'athlete') return jsonError('Alleen de atleet kan deze profielgegevens aanpassen.', 403)

  const preferences = objectValue(profile.preferences)
  const athleteProfile = objectValue(preferences.athleteProfile)
  const nextPreferences = { ...preferences, athleteProfile: { ...athleteProfile, age } }
  const { data: saved, error: saveError } = await supabase.from('profiles')
    .update({ full_name: name, preferences: nextPreferences, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select('id,full_name,preferences')
    .single()
  if (saveError || !saved) return jsonError('Je profielgegevens konden niet worden opgeslagen.', 500)

  return Response.json({ ok: true, profile: { id: saved.id, name: saved.full_name, email: user.email, age } }, { headers: { 'Cache-Control': 'no-store' } })
}
