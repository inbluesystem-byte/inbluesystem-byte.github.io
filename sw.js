/* Service worker: guarda la "cáscara" de la app para que abra rápido e instale.
   Los datos siempre vienen de internet (Apps Script). Cambiá VERSION al publicar cambios. */
var VERSION = "dtorden-v2";
var ARCHIVOS = ["./", "index.html", "css/styles.css", "js/config.js", "js/api.js", "js/pizarra.js", "js/app.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "privacidad.html"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ARCHIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return; // API: directo a internet
  // Primero internet (para tener siempre la última versión), si no hay conexión usa la copia guardada
  e.respondWith(
    fetch(req).then(function (res) {
      var copia = res.clone();
      caches.open(VERSION).then(function (c) { c.put(req, copia); });
      return res;
    }).catch(function () {
      return caches.match(req).then(function (r) { return r || caches.match("index.html"); });
    })
  );
});
