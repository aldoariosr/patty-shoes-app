/* Service worker básico: cache de assets estáticos + fallback offline */
const CACHE_NAME = 'patty-shoes-v1'
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo192.png',
  '/logo512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Navegación: red primero (datos frescos), caché como respaldo offline.
// Assets estáticos: caché primero.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Nunca interceptar llamadas a Supabase ni otras APIs
  if (url.origin !== self.location.origin) return

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copia = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copia))
          return res
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((res) => {
          if (res.ok && (url.pathname.startsWith('/static/') || ASSETS.includes(url.pathname))) {
            const copia = res.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia))
          }
          return res
        })
      )
    })
  )
})
