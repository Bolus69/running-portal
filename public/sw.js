/* Cache only this public fallback. Never cache accounts, HTML dashboards, API data or uploads. */
const CACHE = 'marathon-coach-public-v1'
const OFFLINE = '/offline.html'
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE, { cache: 'reload' }))))
  // Leave new versions waiting until existing app windows close. Never reload an open form.
})
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys
    .filter((key) => key.startsWith('marathon-coach-public-') && key !== CACHE)
    .map((key) => caches.delete(key)))))
})
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || url.origin !== self.location.origin) return
  // Authentication and API requests must receive the original server response.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return
  event.respondWith(fetch(event.request).catch(async () => {
    const fallback = await caches.match(OFFLINE)
    return fallback || Response.error()
  }))
})
