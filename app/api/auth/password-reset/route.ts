import { NextResponse } from 'next/server'
import { isSameOriginRequest } from '@/lib/http'
import { createServerSupabaseClient } from '@/lib/supabase/server'

function redirectToForm(request: Request, query: string, email?: string) {
  const destination = new URL('/forgot-password?' + query, request.url)
  if (email && query !== 'sent=1') destination.searchParams.set('email', email)
  return NextResponse.redirect(destination, 303)
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return new Response('Ongeldig verzoek.', { status: 403 })

  let email = ''
  try {
    const form = await request.formData()
    email = String(form.get('email') ?? '').trim().toLowerCase()
  } catch {
    return redirectToForm(request, 'error=temporary')
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return redirectToForm(request, 'error=invalid', email)
  }

  try {
    const requestUrl = new URL(request.url)
    if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(requestUrl.hostname)) {
      return redirectToForm(request, 'error=local', email)
    }
    const supabase = await createServerSupabaseClient()
    const configuredPreviewUrl = process.env.VERCEL_ENV === 'preview'
      ? process.env.STRAVA_WEBHOOK_CALLBACK_ORIGIN || process.env.NEXT_PUBLIC_APP_URL
      : undefined
    let callbackOrigin = requestUrl.origin
    if (configuredPreviewUrl) {
      try {
        const previewUrl = new URL(configuredPreviewUrl)
        if (previewUrl.protocol === 'https:') callbackOrigin = previewUrl.origin
      } catch {
        // Keep the request origin when the optional Preview URL is invalid.
      }
    }
    // Reuse the exact callback URL already allowed in Supabase for athlete invitations.
    // A different path can fall back to Supabase's Site URL (which is localhost here).
    const redirectTo = new URL('/auth/accept', callbackOrigin).toString()
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) return redirectToForm(request, 'error=temporary', email)
    return redirectToForm(request, 'sent=1')
  } catch {
    return redirectToForm(request, 'error=temporary', email)
  }
}
