// Service worker: ทำให้แอพเปิดได้แม้ไม่มีอินเทอร์เน็ต
// - ไฟล์ของแอพ: ดึงจากเน็ตก่อน (ได้เวอร์ชันล่าสุดเสมอ) ถ้าไม่มีเน็ตใช้ตัวที่เก็บไว้ในเครื่อง
// - ฟอนต์จาก Google Fonts: เก็บไว้ในเครื่องหลังโหลดครั้งแรก
// - /api/ (AI): ไม่เก็บ ต้องใช้เน็ตเสมอ
const APP_CACHE = "lc-app-v1";
const FONT_CACHE = "lc-fonts-v1";
const SHELL = [
  "/", "/index.html", "/css/style.css", "/manifest.json",
  "/js/app.js", "/js/data.js", "/js/data-langs.js", "/js/data-inter.js",
  "/icons/icon-192.png", "/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    // รอเน็ตไม่เกิน 5 วินาที เน็ตช้ามากจะใช้ตัวในเครื่องแทน
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 5000))]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") return (await cache.match("/index.html")) || (await cache.match("/"));
    throw err;
  }
}

async function fontCache(req) {
  const cache = await caches.open(FONT_CACHE);
  const hit = await cache.match(req);
  const update = fetch(req).then((res) => {
    if (res.ok || res.type === "opaque") cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || update;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/")) return;
    e.respondWith(networkFirst(req));
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(fontCache(req));
  }
});
