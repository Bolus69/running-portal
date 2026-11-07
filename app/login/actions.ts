'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  if (!email || !password) redirect('/login?error=Vul%20je%20e-mailadres%20en%20wachtwoord%20in.')

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) redirect('/login?error=Inloggen%20lukte%20niet.%20Controleer%20je%20gegevens.')
  redirect('/')
}
