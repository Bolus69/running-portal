import Link from 'next/link'
import { LogoMark } from '@/components/logo'
import { isSupabaseConfigured } from '@/lib/supabase/env'

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; email?: string }> }) {
  const { sent, error, email } = await searchParams
  const configured = isSupabaseConfigured()
  const initialEmail = typeof email === 'string' ? email.slice(0, 254) : ''
  let previewLoginUrl: string | undefined
  const previewOrigin = process.env.STRAVA_WEBHOOK_CALLBACK_ORIGIN || process.env.NEXT_PUBLIC_APP_URL
  if (previewOrigin) {
    try {
      const parsedOrigin = new URL(previewOrigin)
      if (parsedOrigin.protocol === 'https:') previewLoginUrl = new URL('/login' + (initialEmail ? '?email=' + encodeURIComponent(initialEmail) : ''), parsedOrigin.origin).toString()
    } catch {
      // An invalid optional preview URL is ignored.
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <Link href="/" className="login-brand"><LogoMark /><span><strong>Marathon Coach</strong><small>by Maarten</small></span></Link>
        <p className="eyebrow">ACCOUNT HERSTELLEN</p>
        <h1>Wachtwoord vergeten?</h1>
        <p className="login-intro">Vul het e-mailadres van je account in. Je krijgt een link om een nieuw wachtwoord te kiezen.</p>

        {sent === '1' ? (
          <p className="invite-success" role="status">Als er een account met dit e-mailadres bestaat, ontvang je een e-mail met een herstel-link. Controleer ook je spammap.</p>
        ) : configured ? (
          <form className="login-form" action="/api/auth/password-reset" method="post">
            <label className="field"><span>E-mailadres</span><input required type="email" name="email" maxLength={254} autoComplete="email" defaultValue={initialEmail} /></label>
            {error === 'invalid' && <p className="login-error" role="alert">Controleer het e-mailadres en probeer het opnieuw.</p>}
            {error === 'temporary' && <p className="login-error" role="alert">De herstelmail kon nu niet worden verstuurd. Probeer het later opnieuw.</p>}
            {error === 'expired' && <p className="login-error" role="alert">De link is verlopen of al gebruikt. Vraag hieronder een nieuwe link aan.</p>}
            {error === 'local' && <div className="login-error" role="alert"><p>Je gebruikt een lokale testversie. Vraag de herstelmail aan via de online app.</p>{previewLoginUrl && <Link href={previewLoginUrl}>Open de online app</Link>}</div>}
            <button className="button button-primary full-width">Herstel-link versturen</button>
            <p className="login-help">Om veiligheidsredenen laten we niet zien of een e-mailadres een account heeft.</p>
          </form>
        ) : (
          <p className="login-error" role="alert">Wachtwoordherstel is in deze voorbeeldomgeving niet beschikbaar.</p>
        )}

        <Link className="login-back" href="/login">← Terug naar inloggen</Link>
      </section>
      <p className="login-footer">Persoonlijke marathonbegeleiding</p>
    </main>
  )
}
