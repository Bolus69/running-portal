'use client'

import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type InviteState = 'checking' | 'ready' | 'invalid' | 'saved'

export function AcceptInviteForm({ url, publishableKey }: { url: string; publishableKey: string }) {
  const router = useRouter()
  const [state, setState] = useState<InviteState>('checking')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    const finishInvite = async () => {
      const supabase = createBrowserClient(url, publishableKey)
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')
      const code = new URLSearchParams(window.location.search).get('code')
      let authError: Error | null = null

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        authError = error
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        authError = error
      } else if (new URLSearchParams(window.location.search).has('error')) {
        authError = new Error('De uitnodigingslink is verlopen of ongeldig.')
      }

      window.history.replaceState({}, document.title, window.location.pathname)
      if (!authError) {
        const { data, error } = await supabase.auth.getUser()
        authError = error
        if (!cancelled && data.user) setEmail(data.user.email ?? '')
      }
      if (!cancelled) {
        setErrorMessage(authError ? 'Deze link is verlopen of ongeldig. Vraag een nieuwe herstel-link aan of vraag je coach om een nieuwe uitnodiging.' : '')
        setState(authError ? 'invalid' : 'ready')
      }
    }
    void finishInvite().catch(() => {
      if (!cancelled) {
        setErrorMessage('De uitnodiging kon niet worden gecontroleerd. Vraag je coach om een nieuwe link.')
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
    setState('saved')
    setErrorMessage('')
    router.replace('/')
  }

  if (state === 'checking') return <p className="login-help" role="status">Link controleren…</p>
  if (state === 'invalid') return <div className="invite-invalid"><p className="login-error" role="alert">{errorMessage || 'Deze link is verlopen of ongeldig.'}</p><Link className="button button-primary full-width" href="/forgot-password">Nieuwe herstel-link aanvragen</Link><p className="login-help">Gaat het om een uitnodiging? Vraag je coach om een nieuwe link. Open de link in dezelfde browser.</p></div>
  if (state === 'saved') return <p className="invite-success" role="status">Je wachtwoord is ingesteld. Je wordt doorgestuurd…</p>

  return <form className="login-form" onSubmit={setNewPassword}>
    {email && <p className="invite-email">Account voor <strong>{email}</strong></p>}
    <label className="field"><span>Nieuw wachtwoord</span><input required type="password" minLength={6} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <label className="field"><span>Herhaal wachtwoord</span><input required type="password" minLength={6} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
    {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
    <button className="button button-primary full-width">Wachtwoord instellen</button>
    <p className="login-help">Gebruik minimaal 6 tekens.</p>
  </form>
}
