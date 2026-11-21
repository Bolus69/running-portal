import Link from 'next/link'
import { LogoMark } from './logo'

export function SetupRequired() {
  return (
    <main className="setup-required-page">
      <section className="setup-required-card">
        <LogoMark />
        <p className="eyebrow">OMGEVING NOG NIET GEREED</p>
        <h1>De accountomgeving is nog niet aangesloten</h1>
        <p>De beveiligde database-instellingen zijn aanwezig, maar de benodigde tabellen of toegangsrechten ontbreken nog. Pas de meegeleverde databasemigratie toe en probeer daarna opnieuw.</p>
        <Link href="/login" className="button button-outline">Naar inloggen</Link>
      </section>
    </main>
  )
}
