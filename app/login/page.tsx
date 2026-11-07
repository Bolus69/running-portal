import Link from 'next/link'
import { signIn } from './actions'
import { LogoMark } from '@/components/logo'
import { isSupabaseConfigured } from '@/lib/supabase/env'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  return (
    <main className="login-page">
      <section className="login-card">
        <Link href="/" className="login-brand"><LogoMark /><span><strong>Marathon Coach</strong><small>by Maarten</small></span></Link>
        <p className="eyebrow">WELKOM TERUG</p>
        <h1>Log in op je account</h1>
        <p className="login-intro">Gebruik het e-mailadres waarmee je coach je heeft uitgenodigd.</p>
        {!isSupabaseConfigured() ? (
          <div className="login-preview">
            <strong>Voorbeeldomgeving</strong>
            <span>Bekijk de app met fictieve gegevens, zonder account.</span>
            <Link className="button button-primary" href="/demo">Open de voorbeeldapp</Link>
          </div>
        ) : (
          <>
            <form action={signIn} className="login-form">
              <label className="field"><span>E-mailadres</span><input required type="email" name="email" autoComplete="email" /></label>
              <label className="field"><span>Wachtwoord</span><input required type="password" name="password" autoComplete="current-password" /></label>
              {error && <p className="login-error" role="alert">{decodeURIComponent(error)}</p>}
              <button className="button button-primary full-width">Inloggen</button>
              <p className="login-help">Nog geen account? Vraag je coach om een uitnodiging.</p>
            </form>
            <div className="login-preview">
              <strong>Eerst even rondkijken?</strong>
              <span>De voorbeeldapp gebruikt alleen fictieve gegevens.</span>
              <Link className="button button-outline" href="/demo">Bekijk de voorbeeldapp</Link>
            </div>
          </>
        )}
        <Link className="login-back" href="/">← Terug naar de app</Link>
      </section>
      <p className="login-footer">Persoonlijke marathonbegeleiding · {new Date().getFullYear()}</p>
    </main>
  )
}
