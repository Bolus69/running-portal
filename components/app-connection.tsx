'use client'

import { useEffect, useState } from 'react'

export function AppConnection() {
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
        // Installation and online use remain available when a browser restricts service workers.
      })
    }
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  if (!offline) return null
  return <div className="connection-banner" role="alert">Je bent offline. Maak verbinding om gegevens te laden of op te slaan. Controleer na opnieuw verbinden of je wijzigingen zijn opgeslagen.</div>
}
