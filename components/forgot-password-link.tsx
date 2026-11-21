'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

export function ForgotPasswordLink() {
  const router = useRouter()

  function openResetPage(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    const form = event.currentTarget.closest('form')
    const email = form?.querySelector<HTMLInputElement>('input[name="email"]')?.value.trim() ?? ''
    router.push(email ? '/forgot-password?email=' + encodeURIComponent(email) : '/forgot-password')
  }

  return <Link className="login-reset-link" href="/forgot-password" onClick={openResetPage}>Wachtwoord vergeten?</Link>
}
