import { timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/admin'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { encryptStravaToken, ensureStravaWebhookSubscription, stravaOAuthConfigured, syncStravaActivities } from '@/lib/strava'

type TokenResponse = { access_token: string; refresh_token: string; expires_at: number; athlete?: { id?: number }; scope?: string }

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const state = url.searchParams.get('state') ?? ''
  const code = url.searchParams.get('code') ?? ''
  const cookieStore = await cookies()
  const expectedState = cookieStore.get('strava_oauth_state')?.value ?? ''
  const origin = url.origin
  const responseError = url.searchParams.get('error')
  if (responseError || !code || !state || !expectedState || !safeEqual(state, expectedState)) {
    const response = NextResponse.redirect(new URL('/?strava=cancelled', origin))
    response.cookies.delete('strava_oauth_state')
    return response
  }
  if (!stravaOAuthConfigured()) return NextResponse.redirect(new URL('/?strava=not-configured', origin))
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login?error=Log%20eerst%20opnieuw%20in.', origin))
  const clientId = process.env.STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  if (!clientId || !clientSecret) return NextResponse.redirect(new URL('/?strava=not-configured', origin))

  try {
    const tokenResponse = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' }),
      cache: 'no-store',
    })
    if (!tokenResponse.ok) throw new Error('token exchange')
    const tokens = await tokenResponse.json() as TokenResponse
    const athleteId = Number(tokens.athlete?.id)
    if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(athleteId) || athleteId <= 0) throw new Error('token response')
    const admin = createAdminSupabaseClient()
    const { error } = await admin.from('strava_connections').upsert({
      athlete_id: user.id,
      strava_athlete_id: athleteId,
      access_token_enc: encryptStravaToken(tokens.access_token),
      refresh_token_enc: encryptStravaToken(tokens.refresh_token),
      expires_at: new Date(tokens.expires_at * 1000).toISOString(),
      last_synced_at: null,
      scopes: tokens.scope ? tokens.scope.split(/[ ,]+/).filter(Boolean) : [],
      is_active: true,
      revoked_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id' })
    if (error) throw new Error('connection save')
    let syncOk = true
    let webhookReady = true
    try { await syncStravaActivities(admin, user.id) } catch { syncOk = false }
    try { await ensureStravaWebhookSubscription(origin) } catch { webhookReady = false }
    const destination = new URL(syncOk ? '/?strava=connected' : '/?strava=connected&sync=partial', origin)
    if (!webhookReady) destination.searchParams.set('webhook', 'setup-failed')
    const response = NextResponse.redirect(destination)
    response.cookies.delete('strava_oauth_state')
    return response
  } catch {
    const response = NextResponse.redirect(new URL('/?strava=error', origin))
    response.cookies.delete('strava_oauth_state')
    return response
  }
}
