import type { Metadata } from 'next'
import './globals.css'
import { BRAND } from '@/lib/brand'

export const metadata: Metadata = {
  title: BRAND.appName + ' ' + BRAND.byline,
  description: 'Persoonlijke marathontraining met overzicht voor atleet en coach.',
  applicationName: BRAND.appName,
  icons: { icon: '/marathon-coach-mark.png' },
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  )
}
