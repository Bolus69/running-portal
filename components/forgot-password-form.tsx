'use client'

import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import { useState } from 'react'

type RequestState = 'idle' | 'sending' | 'sent'

export function ForgotPasswordForm({
  url,
  publishableKey,
  initialEmail,
  initialSent = false,
  initialError = '',
  previewLoginUrl,
}: {
  url: string
  publishableKey: string
  initialEmail: string
  initialSent?: boolean
  initialError?: string
  previewLoginUrl?: string
}) {
  const [email, setEmail] = useState(initialEmail)
  const [state, setState] = useState<RequestState>(initialSent ? 'sent' : 'idle')
  const [errorMessage, setErrorMessage] = useState(initialError)
  const [localBlocked, setLocalBlocked] = useState(false)

  async function sendResetLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage('')
    setLocalBlocked(false)

    const hostname = window.location.hostname
    if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)) {
      setLocalBlocked(true)
      setErrorMessage('Wachtwoordherstel is alleen beschikbaar via de online Preview-app.')
      return
    }

    setState('sending')
    try {
      const supabase = createBrowserClient(url, publishableKey, {
        auth: { detectSessionInUrl: false },
      })
      const redirectTo = new URL('/auth/accept', window.location.origin).toString()
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo })
      if (error) throw error
      setState('sent')
    } catch {
      setState('idle')
      setErrorMessage('De herstelmail kon niet worden verstuurd. Probeer het later opnieuw.')
    }
  }

  return (
    <form className="login-form" onSubmit={sendResetLink}>
      <label className="field">
        <span>E-mailadres</span>
        <input
          required
          type="email"
          name="email"
          maxLength={254}
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      {state === 'sent' && (
        <p className="invite-success" role="status">
          Als er een account met dit e-mailadres bestaat, ontvang je een e-mail met een herstel-link. Controleer ook je spammap.
        </p>
      )}
      {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
      {localBlocked && previewLoginUrl && (
        <p className="login-help"><Link href={previewLoginUrl}>Open de online Preview-app</Link></p>
      )}
      <button className="button button-primary full-width" type="submit" disabled={state === 'sending'}>
        {state === 'sending' ? 'Bezig met versturen…' : 'Herstel-link versturen'}
      </button>
      <p className="login-help">Om veiligheidsredenen laten we niet zien of een e-mailadres een account heeft.</p>
    </form>
  )
}
