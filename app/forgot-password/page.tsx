import Link from 'next/link'
import { LogoMark } from '@/components/logo'
import { ForgotPasswordForm } from '@/components/forgot-password-form'
import { getSupabasePublicConfig } from '@/lib/supabase/env'

const resetErrors: Record<string, string> = {
  invalid: 'Controleer het e-mailadres en probeer het opnieuw.',
  temporary: 'De herstelmail kon nu niet worden verstuurd. Probeer het later opnieuw.',
  expired: 'De link is verlopen of al gebruikt. Vraag hieronder een nieuwe link aan.',
  local: 'Je gebruikt een lokale testversie. Vraag de herstelmail aan via de online app.',
}

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; email?: string }> }) {
  const { sent, error, email } = await searchParams
  const config = getSupabasePublicConfig()
  const initialEmail = typeof email === 'string' ? email.slice(0, 254) : ''
  let previewLoginUrl: string | undefined
  const previewOrigin = process.env.STRAVA_WEBHOOK_CALLBACK_ORIGIN || process.env.NEXT_PUBLIC_APP_URL
  if (previewOrigin) {
    try {
      const parsedOrigin = new URL(previewOrigin)
      if (parsedOrigin.protocol === 'https:') previewLoginUrl = new URL('/login' + (initialEmail ? '?email=' + encodeURIComponent(initialEmail) : ''), parsedOrigin.origin).toString()
    } catch {
      // Een ongeldige optionele Preview-URL wordt genegeerd.
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <Link href="/" className="login-brand"><LogoMark /><span><strong>Marathon Coach</strong><small>by Maarten</small></span></Link>
        <p className="eyebrow">ACCOUNT HERSTELLEN</p>
        <h1>Wachtwoord vergeten?</h1>
        <p className="login-intro">Vul het e-mailadres van je account in. Je krijgt een link om een nieuw wachtwoord te kiezen.</p>

        {config ? (
          <ForgotPasswordForm
            url={config.url}
            publishableKey={config.publishableKey}
            initialEmail={initialEmail}
            initialSent={sent === '1'}
            initialError={error ? resetErrors[error] ?? '' : ''}
            previewLoginUrl={previewLoginUrl}
          />
        ) : (
          <p className="login-error" role="alert">Wachtwoordherstel is in deze voorbeeldomgeving niet beschikbaar.</p>
        )}

        <Link className="login-back" href="/login">← Terug naar inloggen</Link>
      </section>
      <p className="login-footer">Persoonlijke marathonbegeleiding</p>
    </main>
  )
}
