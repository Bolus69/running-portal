import Link from 'next/link'
import { LogoMark } from '@/components/logo'
import { ResetPasswordForm } from '@/components/reset-password-form'
import { getSupabasePublicConfig } from '@/lib/supabase/env'

export default function ResetPasswordPage() {
  const config = getSupabasePublicConfig()
  return (
    <main className="login-page">
      <section className="login-card">
        <Link href="/" className="login-brand"><LogoMark /><span><strong>Marathon Coach</strong><small>by Maarten</small></span></Link>
        <p className="eyebrow">ACCOUNT HERSTELLEN</p>
        <h1>Kies een nieuw wachtwoord</h1>
        <p className="login-intro">Stel een nieuw wachtwoord in om weer toegang te krijgen tot je trainingsomgeving.</p>
        {config ? <ResetPasswordForm url={config.url} publishableKey={config.publishableKey} /> : <p className="login-error" role="alert">De accountomgeving is nog niet ingesteld.</p>}
        <Link className="login-back" href="/login">← Terug naar inloggen</Link>
      </section>
      <p className="login-footer">Persoonlijke marathonbegeleiding</p>
    </main>
  )
}
