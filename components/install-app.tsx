'use client'

import { useEffect, useState } from 'react'

type InstallEvent = Event & {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)')
    const update = () => setInstalled(media.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
    update()
    const capture = (event: Event) => {
      event.preventDefault()
      setPrompt(event as InstallEvent)
    }
    const done = () => { setInstalled(true); setPrompt(null) }
    window.addEventListener('beforeinstallprompt', capture)
    window.addEventListener('appinstalled', done)
    media.addEventListener('change', update)
    return () => {
      window.removeEventListener('beforeinstallprompt', capture)
      window.removeEventListener('appinstalled', done)
      media.removeEventListener('change', update)
    }
  }, [])
  async function install() {
    if (!prompt) return
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      setPrompt(null)
      setMessage(choice.outcome === 'accepted' ? 'Open Marathon Coach via het app-icoon zodra de installatie klaar is.' : 'Je kunt de app later installeren via het menu van je browser.')
    } catch {
      setPrompt(null)
      setMessage('Gebruik de stappen hieronder om de app via je browser te installeren.')
    }
  }
  return <div className="install-action">
    {installed ? <p role="status">Je gebruikt Marathon Coach al als app op dit apparaat.</p> : prompt ? <button type="button" className="button button-primary" onClick={install}>Marathon Coach installeren</button> : <p>Volg hieronder de stappen voor jouw apparaat.</p>}
    {message && <p role="status">{message}</p>}
  </div>
}
