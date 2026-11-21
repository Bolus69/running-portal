import { NextResponse } from 'next/server'
import { isSameOriginRequest } from '@/lib/http'
import { appOrigin } from '@/lib/app-origin'
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
    const redirectTo = new URL('/auth/accept', appOrigin(request.url)).toString()
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) return redirectToForm(request, 'error=temporary', email)
    return redirectToForm(request, 'sent=1')
  } catch {
    return redirectToForm(request, 'error=temporary', email)
  }
}
