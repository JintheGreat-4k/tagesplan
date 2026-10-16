// Ersatz für https://jinthegreat-4k.github.io/tagesplan/sw.js (zusammen mit index.html aus diesem Ordner, erst nach
// Marcs Bestätigung des Lifehub veröffentlichen). Chrome holt ihn beim nächsten Öffnen der alten Adresse oder nach
// einem Popup. Er meldet die Popups dieses Geräts beim Google-Skript ab, beendet das Abo, löscht die tagesplan-*-
// Zwischenspeicher (darin lagen Adresse und Schlüssel des Skripts) und meldet sich selbst ab.
const URL_RE = /^https:\/\/script\.google\.com\/(?:a\/macros\/[^\/?#]+|macros)\/s\/[\w-]+\/exec$/;
const ZIEL = "https://lauener.online/plan/";

async function aufraeumen(){
  let sub = null;
  try { sub = await self.registration.pushManager.getSubscription(); } catch(e){ sub = null; }
  if (sub){
    try {
      const c = await caches.open("tagesplan-cfg");
      const res = await c.match("cfg");
      const cfg = res ? await res.json() : null;
      if (cfg && typeof cfg.u === "string" && URL_RE.test(cfg.u) && typeof cfg.k === "string"){
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        await fetch(cfg.u, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, cache:"no-store", signal:ctrl.signal,
          body:JSON.stringify({key:cfg.k, action:"push_aus", endpoint:sub.endpoint})}).catch(() => {});
        clearTimeout(timer);
      }
    } catch(e){ /* weiter: das Abo endet so oder so */ }
    try { await sub.unsubscribe(); } catch(e){}
  }
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("tagesplan-")).map(k => caches.delete(k)));
  } catch(e){}
  try { await self.registration.unregister(); } catch(e){}
}

self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(aufraeumen()); });

// Kommt bis zum Aufräumen noch ein Popup an: Chrome verlangt eine sichtbare Meldung.
self.addEventListener("push", e => {
  e.waitUntil(self.registration.showNotification("Marcs Tagesplan", {body:"Der Tagesplan ist umgezogen. Antippen öffnet ihn im Lifehub.", tag:"umzug"})
    .then(aufraeumen));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.openWindow(ZIEL));
});
