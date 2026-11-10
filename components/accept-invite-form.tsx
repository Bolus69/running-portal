'use client'

import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import { useEffect, useRef, useState } from 'react'

type InviteState = 'checking' | 'ready' | 'invalid' | 'saved'

export function AcceptInviteForm({ url, publishableKey }: { url: string; publishableKey: string }) {
  const [state, setState] = useState<InviteState>('checking')
  const [email, setEmail] = useState('')
  const [inviteUserId, setInviteUserId] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const verification = useRef<Promise<{ email: string; userId: string; errorMessage: string | null }> | null>(null)

  useEffect(() => {
    if (!verification.current) {
      verification.current = (async () => {
        const supabase = createBrowserClient(url, publishableKey, {
          auth: { detectSessionInUrl: false },
        })
        const query = new URLSearchParams(window.location.search)
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const accessToken = hash.get('access_token')
        const refreshToken = hash.get('refresh_token')
        const code = query.get('code')
        const tokenHash = query.get('token_hash')
        let authError: Error | null = null
        let userEmail = ''
        let userId = ''

        if (query.has('error') || query.has('error_code')) {
          authError = new Error('De uitnodigingslink is verlopen of ongeldig.')
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          authError = error
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          authError = error
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' })
          authError = error
        } else {
          // A coach may already be signed in in this browser. That session must
          // never count as proof that this invitation was opened.
          authError = new Error('Open de persoonlijke uitnodigingslink om je account te activeren.')
        }

        window.history.replaceState({}, document.title, window.location.pathname)
        if (!authError) {
          const { data, error } = await supabase.auth.getUser()
          authError = error ?? (!data.user ? new Error('De uitnodiging kon niet worden gecontroleerd.') : null)
          if (!authError && data.user) {
            userEmail = data.user.email ?? ''
            userId = data.user.id
          }
        }

        return {
          email: userEmail,
          userId,
          errorMessage: authError
            ? 'Deze uitnodigingslink is verlopen of ongeldig. Vraag je coach om een nieuwe link.'
            : null,
        }
      })()
    }

    void verification.current.then((result) => {
      setEmail(result.email)
      setInviteUserId(result.userId)
      setErrorMessage(result.errorMessage ?? '')
      setState(result.errorMessage ? 'invalid' : 'ready')
    }).catch(() => {
      setErrorMessage('De link kon niet worden gecontroleerd. Vraag een nieuwe herstel-link aan of vraag je coach om een nieuwe uitnodiging.')
      setState('invalid')
    })
  }, [publishableKey, url])

  async function setNewPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password.length < 6) return setErrorMessage('Kies een wachtwoord van minimaal 6 tekens.')
    if (password !== confirmation) return setErrorMessage('De wachtwoorden komen niet overeen.')
    const supabase = createBrowserClient(url, publishableKey, {
      auth: { detectSessionInUrl: false },
    })
    const { data: currentUser, error: sessionError } = await supabase.auth.getUser()
    if (sessionError || !currentUser.user || currentUser.user.id !== inviteUserId) {
      setErrorMessage('De uitnodigingssessie is verlopen. Vraag je coach om een nieuwe uitnodigingslink.')
      setState('invalid')
      return
    }
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return setErrorMessage('Het wachtwoord kon niet worden opgeslagen. Probeer het opnieuw.')
    setState('saved')
    setErrorMessage('')
    // A full page load clears any cached dashboard for another account in the
    // same browser and loads the newly activated athlete's own profile.
    window.location.replace('/')
  }

  if (state === 'checking') return <p className="login-help" role="status">Link controleren…</p>
  if (state === 'invalid') return <div className="invite-invalid"><p className="login-error" role="alert">{errorMessage || 'Deze uitnodiging is verlopen of ongeldig.'}</p><p className="login-help">Vraag je coach om een nieuwe uitnodiging en open de link in dezelfde browser.</p><Link className="button button-outline full-width" href="/login">Naar inloggen</Link></div>
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
