'use client'

import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import { useEffect, useRef, useState } from 'react'

type InviteState = 'checking' | 'confirm' | 'verifying' | 'ready' | 'invalid' | 'saved'
type LinkFlow = 'invite' | 'recovery'

export function AcceptInviteForm({ url, publishableKey }: { url: string; publishableKey: string }) {
  const [state, setState] = useState<InviteState>('checking')
  const [flow, setFlow] = useState<LinkFlow>('invite')
  const [email, setEmail] = useState('')
  const [inviteUserId, setInviteUserId] = useState('')
  const [pendingTokenHash, setPendingTokenHash] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const verification = useRef<Promise<{ email: string; userId: string; flow: LinkFlow; tokenHash: string; errorMessage: string | null }> | null>(null)

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
        const tokenType = query.get('type')
        const flow: LinkFlow = query.get('flow') === 'recovery' || tokenType === 'recovery' || hash.get('type') === 'recovery' ? 'recovery' : 'invite'
        let authError: Error | null = null
        let userEmail = ''
        let userId = ''

        if (tokenHash && !query.has('error') && !query.has('error_code')) {
          // Do not consume one-time links during page load. Email security
          // scanners often prefetch links; verification happens only after
          // the user presses the button on this page.
          window.history.replaceState({}, document.title, window.location.pathname)
          return { email: '', userId: '', flow, tokenHash, errorMessage: null }
        } else if (query.has('error') || query.has('error_code')) {
          authError = new Error(flow === 'recovery'
            ? 'De herstel-link kan niet meer worden gebruikt.'
            : 'De uitnodigingslink kan niet meer worden gebruikt.')
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          authError = error
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
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
          flow,
          tokenHash: '',
          errorMessage: authError ? flow === 'recovery'
            ? 'Deze herstel-link kan niet meer worden gebruikt. Hij kan verlopen zijn of al eerder zijn geopend. Vraag een nieuwe herstel-link aan.'
            : 'Deze uitnodigingslink kan niet meer worden gebruikt. Hij kan verlopen zijn of al eerder zijn geopend. Vraag je coach om een nieuwe link.' : null,
        }
      })()
    }

    void verification.current.then((result) => {
      setFlow(result.flow)
      setEmail(result.email)
      setInviteUserId(result.userId)
      setPendingTokenHash(result.tokenHash)
      setErrorMessage(result.errorMessage ?? '')
      setState(result.errorMessage ? 'invalid' : result.tokenHash ? 'confirm' : 'ready')
    }).catch(() => {
      setErrorMessage('De link kon niet worden gecontroleerd. Vraag een nieuwe herstel-link aan of vraag je coach om een nieuwe uitnodiging.')
      setState('invalid')
    })
  }, [publishableKey, url])

  async function confirmLink() {
    if (!pendingTokenHash) return
    setState('verifying')
    setErrorMessage('')
    try {
      const supabase = createBrowserClient(url, publishableKey, {
        auth: { detectSessionInUrl: false },
      })
      const { error } = await supabase.auth.verifyOtp({ token_hash: pendingTokenHash, type: flow })
      if (error) {
        setPendingTokenHash('')
        setErrorMessage(flow === 'recovery'
          ? 'De herstel-link is verlopen of al gebruikt. Vraag een nieuwe herstel-link aan.'
          : 'De uitnodigingslink is verlopen of al gebruikt. Vraag je coach om een nieuwe link.')
        setState('invalid')
        return
      }
      const { data, error: userError } = await supabase.auth.getUser()
      if (userError || !data.user) {
        setPendingTokenHash('')
        setErrorMessage(flow === 'recovery'
          ? 'De herstelsessie kon niet worden gestart. Vraag een nieuwe herstel-link aan.'
          : 'De uitnodiging kon niet worden gecontroleerd. Vraag je coach om een nieuwe link.')
        setState('invalid')
        return
      }
      setEmail(data.user.email ?? '')
      setInviteUserId(data.user.id)
      setPendingTokenHash('')
      setState('ready')
    } catch {
      setPendingTokenHash('')
      setErrorMessage(flow === 'recovery'
        ? 'De herstel-link kon niet worden gecontroleerd. Vraag een nieuwe herstel-link aan.'
        : 'De uitnodigingslink kon niet worden gecontroleerd. Vraag je coach om een nieuwe link.')
      setState('invalid')
    }
  }

  async function setNewPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (password.length < 6) return setErrorMessage('Kies een wachtwoord van minimaal 6 tekens.')
    if (password !== confirmation) return setErrorMessage('De wachtwoorden komen niet overeen.')
    const supabase = createBrowserClient(url, publishableKey, {
      auth: { detectSessionInUrl: false },
    })
    const { data: currentUser, error: sessionError } = await supabase.auth.getUser()
    if (sessionError || !currentUser.user || currentUser.user.id !== inviteUserId) {
      setErrorMessage(flow === 'recovery'
        ? 'De herstelsessie is verlopen. Vraag een nieuwe herstel-link aan.'
        : 'De uitnodigingssessie is verlopen. Vraag je coach om een nieuwe uitnodigingslink.')
      setState('invalid')
      return
    }
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return setErrorMessage('Het wachtwoord kon niet worden opgeslagen. Probeer het opnieuw.')
    setState('saved')
    setErrorMessage('')
    if (flow === 'recovery') return
    // A full page load clears any cached dashboard for another account in the
    // same browser and loads the newly activated athlete's own profile.
    window.location.replace('/')
  }

  if (state === 'checking') return <p className="login-help" role="status">Link controleren…</p>
  if (state === 'confirm' || state === 'verifying') return <div className="login-form"><p className="login-help">{flow === 'recovery' ? 'Klik hieronder om je herstel-link te controleren en een nieuw wachtwoord te kiezen.' : 'Klik hieronder om je uitnodiging te controleren en je wachtwoord in te stellen.'}</p><button className="button button-primary full-width" type="button" onClick={() => void confirmLink()} disabled={state === 'verifying'}>{state === 'verifying' ? 'Link controleren…' : flow === 'recovery' ? 'Herstel-link gebruiken' : 'Uitnodiging accepteren'}</button></div>
  if (state === 'invalid') return <div className="invite-invalid"><p className="login-error" role="alert">{errorMessage || (flow === 'recovery' ? 'Deze herstel-link kan niet meer worden gebruikt.' : 'Deze uitnodigingslink kan niet meer worden gebruikt.')}</p>{flow === 'recovery' ? <><p className="login-help">Vraag een nieuwe herstel-link aan en open die in dezelfde browser.</p><Link className="button button-outline full-width" href="/forgot-password">Nieuwe herstel-link aanvragen</Link></> : <><p className="login-help">Heb je je account al geactiveerd? Log dan in of vraag een nieuw wachtwoord aan. Is dit je eerste keer? Vraag je coach om een nieuwe uitnodiging en open die in dezelfde browser.</p><Link className="button button-outline full-width" href="/login">Naar inloggen</Link></>}</div>
  if (state === 'saved') return flow === 'recovery'
    ? <div className="invite-invalid"><p className="invite-success" role="status">Je wachtwoord is opnieuw ingesteld. Je kunt nu verder met je account.</p><Link className="button button-primary full-width" href="/">Naar Marathon Coach</Link></div>
    : <p className="invite-success" role="status">Je wachtwoord is ingesteld. Je wordt doorgestuurd…</p>

  return <form className="login-form" onSubmit={setNewPassword}>
    {email && <p className="invite-email">Account voor <strong>{email}</strong></p>}
    <label className="field"><span>Nieuw wachtwoord</span><input required type="password" minLength={6} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <label className="field"><span>Herhaal wachtwoord</span><input required type="password" minLength={6} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
    {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
    <button className="button button-primary full-width">{flow === 'recovery' ? 'Wachtwoord wijzigen' : 'Wachtwoord instellen'}</button>
    <p className="login-help">Gebruik minimaal 6 tekens.</p>
  </form>
}
