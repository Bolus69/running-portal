import Link from 'next/link'
import { LogoMark } from '@/components/logo'
import { AcceptInviteForm } from '@/components/accept-invite-form'
import { getSupabasePublicConfig } from '@/lib/supabase/env'

export default function AcceptInvitePage() {
  const config = getSupabasePublicConfig()
  return (
    <main className="login-page">
      <section className="login-card">
        <Link href="/" className="login-brand"><LogoMark /><span><strong>Marathon Coach</strong><small>by Maarten</small></span></Link>
        <p className="eyebrow">ACCOUNTTOEGANG INSTELLEN</p>
        <h1>Kies een nieuw wachtwoord</h1>
        <p className="login-intro">Rond je uitnodiging af of herstel je toegang tot de trainingsomgeving met een nieuw wachtwoord.</p>
        {config ? <AcceptInviteForm url={config.url} publishableKey={config.publishableKey} /> : <p className="login-error" role="alert">De accountomgeving is nog niet ingesteld.</p>}
        <Link className="login-back" href="/login">← Terug naar inloggen</Link>
      </section>
      <p className="login-footer">Persoonlijke marathonbegeleiding</p>
    </main>
  )
}
