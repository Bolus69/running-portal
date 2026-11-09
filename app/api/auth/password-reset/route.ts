import { NextResponse } from 'next/server'
import { isSameOriginRequest } from '@/lib/http'
import { createServerSupabaseClient } from '@/lib/supabase/server'

function redirectToForm(request: Request, query: string) {
  return NextResponse.redirect(new URL('/forgot-password?' + query, request.url), 303)
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
    return redirectToForm(request, 'error=invalid')
  }

  try {
    const supabase = await createServerSupabaseClient()
    const redirectTo = new URL('/reset-password', new URL(request.url).origin).toString()
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) return redirectToForm(request, 'error=temporary')
    return redirectToForm(request, 'sent=1')
  } catch {
    return redirectToForm(request, 'error=temporary')
  }
}
