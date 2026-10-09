/* Hält die App-Dateien offline bereit und zeigt Popups. Daten kommen immer frisch vom Google-Skript. */
const CACHE = "tagesplan-v2";
const CFG = "tagesplan-cfg"; // Adresse und Schlüssel des Google-Skripts, legt die App hier ab
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("tagesplan-") && k !== CACHE && k !== CFG).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate"){
    // Zuerst aus dem Netz (damit Updates ankommen), offline aus dem Speicher
    e.respondWith(fetch(req).then(res => {
      if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put("./index.html", copy)); }
      return res;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});

/* ---------- Popups ---------- */
async function lesen(name, std){
  try { const r = await (await caches.open(CFG)).match(name); return r ? await r.json() : std; } catch(e){ return std; }
}
async function schreiben(name, wert){
  try { await (await caches.open(CFG)).put(name, new Response(JSON.stringify(wert), {headers:{"Content-Type":"application/json"}})); } catch(e) {}
}
async function skript(action, extra){
  const cfg = await lesen("cfg", null);
  if (!cfg || !cfg.u || !cfg.k) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(cfg.u, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, cache:"no-store", signal:ctrl.signal,
      body:JSON.stringify(Object.assign({key:cfg.k, action}, extra || {}))});
    const j = await res.json();
    return j && j.ok ? j : null;
  } catch(e){ return null; } finally { clearTimeout(timer); }
}

/* Der Push ist leer. Die Texte holt der Service Worker beim Google-Skript ab. */
async function popupsZeigen(){
  const j = await skript("popups");
  const opt = {icon:"icon-192.png", data:{url:"./"}};
  if (!j) return self.registration.showNotification("Marcs Tagesplan", Object.assign({body:"Neue Erinnerung. Antippen zum Öffnen.", tag:"tagesplan"}, opt));
  const items = j.items || [];
  const schon = await lesen("gezeigt", []);
  const neu = items.filter(i => schon.indexOf(i.id) < 0);
  // Chrome verlangt bei jedem Push eine sichtbare Mitteilung
  const liste = neu.length ? neu : items.slice(-1);
  if (!liste.length) return self.registration.showNotification("Marcs Tagesplan", Object.assign({body:"Antippen zum Öffnen.", tag:"tagesplan"}, opt));
  for (const i of liste){
    await self.registration.showNotification(i.title || "Marcs Tagesplan", Object.assign({body:i.body || "", tag:i.id, timestamp:i.at || Date.now()}, opt));
  }
  await schreiben("gezeigt", schon.concat(neu.map(i => i.id)).slice(-80));
}

self.addEventListener("push", e => { e.waitUntil(popupsZeigen()); });

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:"window", includeUncontrolled:true}).then(list => {
    for (const w of list) if ("focus" in w) return w.focus();
    return self.clients.openWindow("./");
  }));
});

/* Chrome erneuert die Push-Adresse selten von selbst: neue Adresse beim Google-Skript melden */
self.addEventListener("pushsubscriptionchange", e => {
  e.waitUntil((async () => {
    const k = await skript("push_schluessel");
    if (!k || !k.key) return;
    let s = k.key.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const sub = await self.registration.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:Uint8Array.from(atob(s), c => c.charCodeAt(0))});
    await skript("push_an", {abo:{endpoint:sub.endpoint}, geraet:/Android/i.test(navigator.userAgent) ? "Handy (Android)" : "Gerät"});
  })());
});
