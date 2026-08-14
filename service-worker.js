const CACHE="agenda-istruttori-v1-21-final";
const FILES=[
  "./",
  "./index.html",
  "./style.css",
  "./auth.css",
  "./transfer.css",
  "./documents.css",
  "./full-backup.css",
  "./app.js",
  "./documents.js",
  "./full-backup.js",
  "./manifest.json",
  "./logo.jpg",
  "./logo.png",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png"
];
self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(FILES))
      .then(()=>self.skipWaiting())
  );
});
self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  event.respondWith(
    fetch(event.request).then(response=>{
      const update=caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
      event.waitUntil(update);
      return response;
    }).catch(async()=>{
      // Ignora la query string: app.js?v=... corrisponde al file app.js precaricato.
      const cached=await caches.match(event.request,{ignoreSearch:true});
      if(cached)return cached;

      // La pagina principale e' un fallback valido soltanto per la navigazione.
      if(event.request.mode==="navigate"){
        return caches.match("./index.html");
      }

      // Non restituire HTML al posto di JavaScript, CSS, immagini, PDF o JSON.
      return Response.error();
    })
  );
});
