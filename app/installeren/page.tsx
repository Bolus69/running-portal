import Link from 'next/link'
import { LogoMark } from '@/components/logo'
import { InstallApp } from '@/components/install-app'

export const metadata = { title: 'App installeren · Marathon Coach' }

export default function InstallPage() {
  return <main className="install-page">
    <section className="install-card">
      <Link href="/" className="login-brand"><LogoMark /><span><strong>Marathon Coach</strong><small>by Maarten</small></span></Link>
      <p className="eyebrow">JOUW TRAINING BINNEN HANDBEREIK</p>
      <h1>Marathon Coach op je apparaat</h1>
      <p>Open je schema vanaf je beginscherm of bureaublad. Installeren is gratis en gaat via je browser. Je gebruikt je bestaande account.</p>
      <InstallApp />
      <div className="install-grid">
        <section><h2>iPhone of iPad</h2><ol><li>Open deze website in Safari.</li><li>Tik op de deelknop. Deze staat soms in het menu met drie puntjes.</li><li>Kies <strong>Zet op beginscherm</strong> en daarna <strong>Voeg toe</strong>.</li></ol></section>
        <section><h2>Android</h2><ol><li>Open deze website in Chrome.</li><li>Open het menu met drie puntjes.</li><li>Kies <strong>App installeren</strong> of <strong>Toevoegen aan startscherm</strong> en bevestig.</li></ol></section>
        <section><h2>Windows</h2><ol><li>Open deze website in Edge of Chrome.</li><li>Klik op het installatie-icoon in de adresbalk, of open het browsermenu en kies de optie om deze website als app te installeren.</li><li>Open Marathon Coach daarna via het startmenu.</li></ol></section>
        <section><h2>Mac</h2><ol><li>Open deze website in Safari op een recente versie van macOS.</li><li>Kies <strong>Archief</strong> en daarna <strong>Voeg toe aan Dock</strong>.</li><li>Open Marathon Coach daarna vanuit je Dock. In Chrome kun je ook het installatie-icoon gebruiken.</li></ol></section>
      </div>
      <p>Je hebt internet nodig om je schema te laden en trainingen, bestanden en feedback op te slaan. Updates ontvang je wanneer je de app opnieuw opent. Log uit op gedeelde apparaten.</p>
      <p>Zie je geen installatieoptie? Gebruik de website in je browser. Alle trainingen en functies blijven daar beschikbaar.</p>
      <Link href="/" className="button button-primary">Naar Marathon Coach</Link>
    </section>
  </main>
}
