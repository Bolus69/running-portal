import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isSameOriginRequest, jsonError } from '@/lib/http'
import { ensureStravaWebhookSubscription, StravaWebhookSetupError, syncStravaActivities } from '@/lib/strava'

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return jsonError('Ongeldig verzoek.', 403)
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonError('Log opnieuw in om Strava te synchroniseren.', 401)
  try {
    const admin = createAdminSupabaseClient()
    const count = await syncStravaActivities(admin, user.id)
    let automaticSyncReady = false
    let automaticSyncIssue: string | undefined
    let automaticSyncDetail: string | undefined
    try {
      await ensureStravaWebhookSubscription(new URL(request.url).origin)
      automaticSyncReady = true
    } catch (error) {
      automaticSyncIssue = error instanceof StravaWebhookSetupError ? error.code : 'setup_failed'
      automaticSyncDetail = error instanceof StravaWebhookSetupError ? error.detail : undefined
      console.warn('[strava-webhook] setup issue:', automaticSyncIssue)
      // Manual imports remain available when webhook delivery is not configured.
    }
    return Response.json({ ok: true, imported: count, automaticSyncReady, automaticSyncIssue, automaticSyncDetail }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return jsonError('Strava kon nu niet worden gesynchroniseerd. Je bestaande trainingsgeschiedenis blijft beschikbaar.', 502)
  }
}
