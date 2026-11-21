import type { Metadata, Viewport } from 'next'
import './globals.css'
import { AppConnection } from '@/components/app-connection'
import { BRAND } from '@/lib/brand'

export const metadata: Metadata = {
  title: BRAND.appName + ' ' + BRAND.byline,
  description: 'Persoonlijke marathontraining met overzicht voor atleet en coach.',
  applicationName: BRAND.appName,
  icons: { icon: '/icons/app-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Marathon Coach' },
}

export const viewport: Viewport = { themeColor: '#193d55', width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body><AppConnection />{children}</body>
    </html>
  )
}
