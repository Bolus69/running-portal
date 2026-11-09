'use client'

import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import { useEffect, useState } from 'react'

type ResetState = 'checking' | 'ready' | 'invalid' | 'saved'

export function ResetPasswordForm({ url, publishableKey }: { url: string; publishableKey: string }) {
  const [state, setState] = useState<ResetState>('checking')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    const checkRecoveryLink = async () => {
      const supabase = createBrowserClient(url, publishableKey)
      const query = new URLSearchParams(window.location.search)
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')
      const code = query.get('code')
      let authError: Error | null = null

      if (query.has('error') || query.has('error_code')) {
        authError = new Error('De herstel-link is verlopen of ongeldig.')
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        authError = error
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        authError = error
      }

      if (!authError) {
        const { data, error } = await supabase.auth.getUser()
        authError = error
        if (!cancelled && data.user) setEmail(data.user.email ?? '')
      }

      window.history.replaceState({}, document.title, window.location.pathname)
      if (!cancelled) {
        setErrorMessage(authError ? 'Deze herstel-link is verlopen of ongeldig. Vraag een nieuwe link aan.' : '')
        setState(authError ? 'invalid' : 'ready')
      }
    }

    void checkRecoveryLink().catch(() => {
      if (!cancelled) {
        setErrorMessage('De herstel-link kon niet worden gecontroleerd. Vraag een nieuwe link aan.')
        setState('invalid')
      }
    })

    return () => { cancelled = true }
  }, [publishableKey, url])

  async function setNewPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password.length < 6) return setErrorMessage('Kies een wachtwoord van minimaal 6 tekens.')
    if (password !== confirmation) return setErrorMessage('De wachtwoorden komen niet overeen.')

    const supabase = createBrowserClient(url, publishableKey)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return setErrorMessage('Het wachtwoord kon niet worden opgeslagen. Probeer het opnieuw.')
    setErrorMessage('')
    setState('saved')
  }

  if (state === 'checking') return <p className="login-help" role="status">Herstel-link controleren…</p>
  if (state === 'invalid') return <div className="invite-invalid"><p className="login-error" role="alert">{errorMessage || 'Deze herstel-link is niet meer geldig.'}</p><Link className="button button-primary full-width" href="/forgot-password">Nieuwe herstel-link aanvragen</Link></div>
  if (state === 'saved') return <div className="invite-invalid"><p className="invite-success" role="status">Je wachtwoord is aangepast. Je kunt nu met je nieuwe wachtwoord inloggen.</p><Link className="button button-primary full-width" href="/login">Naar inloggen</Link></div>

  return <form className="login-form" onSubmit={setNewPassword}>
    {email && <p className="invite-email">Wachtwoord aanpassen voor <strong>{email}</strong></p>}
    <label className="field"><span>Nieuw wachtwoord</span><input required type="password" minLength={6} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <label className="field"><span>Herhaal wachtwoord</span><input required type="password" minLength={6} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
    {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
    <button className="button button-primary full-width">Wachtwoord opslaan</button>
    <p className="login-help">Gebruik minimaal 6 tekens.</p>
  </form>
}
