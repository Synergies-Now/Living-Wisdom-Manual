const CACHE_NAME   = 'lw-manual-v3';
const CACHE_PREFIX = 'lw-manual-';        // CACHE_NAME minus the version

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-192-maskable.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png'
];

// How long to wait on the network for the page itself before falling back to
// the cached copy. The page is ~4 MB, but a conditional request that comes
// back 304 is tiny, so on a decent connection this costs almost nothing.
const NETWORK_WAIT_MS = 3500;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME)
             .map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

function remember(request, response){
  if (response.ok && response.type === 'basic') {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
  }
  return response;
}

// Network first, cache as the offline fallback. Used for the page and the
// manifest, the two files that carry what the app is and says. Serving them
// cache-first meant an edit stayed invisible until someone bumped the cache
// name by hand. 'no-cache' makes the request conditional, so an unchanged
// 4 MB page costs a 304, not a download.
function networkFirst(request, key){
  const fresh = fetch(request, { cache: 'no-cache' }).then(r => remember(key, r));
  const timeout = new Promise((_, reject) => setTimeout(reject, NETWORK_WAIT_MS));
  return Promise.race([fresh, timeout])
    .catch(() => caches.match(key, { ignoreSearch: true }).then(hit => hit || fresh));
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isPage = req.mode === 'navigate' ||
                 url.pathname.endsWith('/index.html') ||
                 url.pathname.endsWith('/');
  if (isPage) {
    // Shortcut URLs like ./?view=find all share the one cached page.
    event.respondWith(networkFirst(req, new Request(new URL('./index.html', self.location))));
    return;
  }
  if (url.pathname.endsWith('/manifest.json')) {
    event.respondWith(networkFirst(req, req));
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(r => remember(req, r)).catch(() => cached);
    })
  );
});
