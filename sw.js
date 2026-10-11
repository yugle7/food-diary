const APP_PREFIX = "fd-";
const VERSION = "2026-10-09";      // совпадает с version в manifest.webmanifest
const REFS_VERSION = "1";          // меняется только при обновлении foods.js

const STATIC_CACHE = `${APP_PREFIX}static-${VERSION}`;
const REFS_CACHE = `${APP_PREFIX}refs-${REFS_VERSION}`;

const STATIC_URLS = [
    "./",
    "index.html",
    "privacy.html",
    "style.css",
    "data.js",
    "script.js",
    "sprite.svg",
    "favicon.svg",
    "manifest.webmanifest",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-192-maskable.png",
    "icons/icon-512-maskable.png"
];

const REFS_URL = "foods.js";

const scoped = path => new URL(path, self.registration.scope).href;

// Установка: кешируем статику и базу продуктов
self.addEventListener("install", e => {
    e.waitUntil((async () => {
        const statics = await caches.open(STATIC_CACHE);
        await statics.addAll(STATIC_URLS.map(scoped));
        const refs = await caches.open(REFS_CACHE);
        if (!await refs.match(scoped(REFS_URL))) await refs.add(scoped(REFS_URL));
        self.skipWaiting();
    })());
});

// Активация: удаляем кеши прошлых версий
self.addEventListener("activate", e => {
    e.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter(key => key.startsWith(APP_PREFIX) && key !== STATIC_CACHE && key !== REFS_CACHE)
            .map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

const cacheFirst = async (cacheName, request) => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request, {ignoreSearch: true});
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
};

const networkFirst = async request => {
    const cache = await caches.open(STATIC_CACHE);
    try {
        const response = await fetch(request);
        if (response.ok) await cache.put(scoped("index.html"), response.clone());
        return response;
    } catch {
        return (await cache.match(scoped("index.html"))) || Response.error();
    }
};

self.addEventListener("fetch", e => {
    if (e.request.method !== "GET") return;

    const url = new URL(e.request.url);
    if (url.origin !== location.origin) return;

    if (e.request.mode === "navigate") return e.respondWith(networkFirst(e.request));
    if (url.pathname.endsWith(`/${REFS_URL}`)) return e.respondWith(cacheFirst(REFS_CACHE, e.request));
    e.respondWith(cacheFirst(STATIC_CACHE, e.request));
});

self.addEventListener("message", e => {
    if (e.data === "skipWaiting") self.skipWaiting();
});
