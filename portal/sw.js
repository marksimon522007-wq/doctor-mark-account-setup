/* Cache only anonymous site shell. Student data, API calls and passwords are never cached here. */
const VERSION='drmark-whatsapp-v4';
const STATIC=['./','./index.html','./styles.css','./app.js','./config.js','./assets/k_chromosome.png','./manifest.webmanifest'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(STATIC)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(x=>x.startsWith('drmark-whatsapp-') && x!==VERSION).map(x=>caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const base=new URL('./',self.registration.scope).pathname;
  const relative=url.pathname.startsWith(base)?url.pathname.slice(base.length):null;
  if(relative===null || !STATIC.some(x=>x==='./'?relative==='':x.slice(2)===relative))return;
  event.respondWith(fetch(event.request).then(res=>{
    if(res.ok){const clone=res.clone();caches.open(VERSION).then(c=>c.put(event.request,clone));}
    return res;
  }).catch(()=>caches.match(event.request)));
});
self.addEventListener('push',event=>{
  let payload={title:'DR Mark Portal',body:'You have a homework reminder.',url:'./'};
  try{if(event.data)payload={...payload,...event.data.json()};}catch{}
  event.waitUntil(self.registration.showNotification(payload.title,{
    body:payload.body,tag:payload.tag||'drmark-homework',icon:'./assets/k_chromosome.png',data:{url:payload.url||'./'}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>clients.length?clients[0].focus():self.clients.openWindow(event.notification.data?.url||'./')));
});