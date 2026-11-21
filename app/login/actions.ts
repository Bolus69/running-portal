'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const withEmail = (message: string) => {
    const params = new URLSearchParams({ error: message, email })
    return '/login?' + params.toString()
  }
  if (!email || !password) redirect(withEmail('Vul je e-mailadres en wachtwoord in.'))

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) redirect(withEmail('Inloggen lukte niet. Controleer je gegevens of vraag een nieuw wachtwoord aan.'))
  redirect('/')
}
