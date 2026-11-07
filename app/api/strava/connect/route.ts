import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { stravaOAuthConfigured } from '@/lib/strava'

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const origin = new URL(request.url).origin
  if (!user) return NextResponse.redirect(new URL('/login', origin))
  if (!stravaOAuthConfigured() || !process.env.STRAVA_CLIENT_ID) return NextResponse.redirect(new URL('/?strava=not-configured', origin))

  const state = randomBytes(24).toString('hex')
  const callbackUrl = new URL('/api/strava/callback', origin).toString()
  const authorizeUrl = new URL('https://www.strava.com/oauth/authorize')
  authorizeUrl.searchParams.set('client_id', process.env.STRAVA_CLIENT_ID)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl)
  authorizeUrl.searchParams.set('approval_prompt', 'auto')
  authorizeUrl.searchParams.set('scope', 'read,activity:read_all')
  authorizeUrl.searchParams.set('state', state)
  const response = NextResponse.redirect(authorizeUrl)
  response.cookies.set('strava_oauth_state', state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 })
  return response
}
