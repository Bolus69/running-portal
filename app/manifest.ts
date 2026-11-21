import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Marathon Coach by Maarten',
    short_name: 'Marathon Coach',
    description: 'Jouw marathontraining, feedback en herstel op één plek.',
    lang: 'nl',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f2f7fa',
    theme_color: '#193d55',
    icons: [
      { src: '/icons/app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/app-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
