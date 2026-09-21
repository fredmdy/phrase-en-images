/* Phrase en images — fonctionnement hors connexion.
   Deux réserves : l'appli elle-même, et les images vues au moins une fois. */

const VERSION = 'v1';
const APPLI = 'appli-' + VERSION;      // la page et ses icônes
const IMAGES = 'images-' + VERSION;    // pictogrammes, photos, polices
const MAX_IMAGES = 400;                // on ne garde pas tout indéfiniment

const A_PRECHARGER = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// Sites dont on garde une copie des images et des réponses
const HOTES_IMAGES = [
  'static.arasaac.org',
  'api.arasaac.org',
  'upload.wikimedia.org',
  'fr.wikipedia.org',
  'commons.wikimedia.org',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APPLI)
      .then(c => c.addAll(A_PRECHARGER))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(noms => Promise.all(
        noms.filter(n => n !== APPLI && n !== IMAGES).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// Limite la taille de la réserve d'images : on retire les plus anciennes
async function limiter(nomCache, max) {
  const cache = await caches.open(nomCache);
  const cles = await cache.keys();
  if (cles.length <= max) return;
  for (let i = 0; i < cles.length - max; i++) await cache.delete(cles[i]);
}

async function reseauPuisCache(request, nomCache) {
  const cache = await caches.open(nomCache);
  try {
    const reponse = await fetch(request);
    if (reponse && (reponse.ok || reponse.type === 'opaque')) {
      cache.put(request, reponse.clone());
      limiter(nomCache, MAX_IMAGES);
    }
    return reponse;
  } catch (e) {
    const copie = await cache.match(request);
    if (copie) return copie;
    throw e;
  }
}

async function cachePuisReseau(request, nomCache) {
  const cache = await caches.open(nomCache);
  const copie = await cache.match(request);
  if (copie) {
    // on rafraîchit en arrière-plan, sans faire attendre
    fetch(request).then(r => {
      if (r && (r.ok || r.type === 'opaque')) cache.put(request, r.clone());
    }).catch(() => {});
    return copie;
  }
  return reseauPuisCache(request, nomCache);
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // La page elle-même : on tente le réseau pour avoir la dernière version,
  // et on retombe sur la copie enregistrée si la connexion manque.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(r => {
          caches.open(APPLI).then(c => c.put('./index.html', r.clone()));
          return r;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Fichiers de l'appli (icônes, manifeste)
  if (url.origin === self.location.origin) {
    event.respondWith(cachePuisReseau(request, APPLI));
    return;
  }

  // Pictogrammes, photos, polices
  if (HOTES_IMAGES.indexOf(url.hostname) >= 0) {
    event.respondWith(cachePuisReseau(request, IMAGES));
  }
});
