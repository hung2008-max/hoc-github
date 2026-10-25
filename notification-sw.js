/* Notification display/click + Web Push receive (push-send Edge Function). No caching. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));

self.addEventListener('push',event=>{
 let d={};try{d=event.data?event.data.json():{}}catch{}
 const title=typeof d.title==='string'&&d.title?d.title:'hungstrikes';
 const options={body:typeof d.body==='string'?d.body:'Bạn có tin nhắn mới. Chạm để xem.',icon:'./icon-192.png',badge:'./favicon-32.png',tag:typeof d.tag==='string'?d.tag:undefined,data:d.data&&typeof d.data==='object'?d.data:undefined};
 event.waitUntil((async()=>{
  // Đang mở app trước mặt (cửa sổ hiển thị + đang focus) thì KHÔNG nảy thông báo máy nữa —
  // người dùng đang ở ngay trong app, đã có banner/âm báo trong app lo. Chỉ hiện khi app ở nền,
  // bị che, hoặc máy đang khóa.
  try{
   const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
   const looking=windows.some(w=>w.url.startsWith(self.registration.scope)&&w.visibilityState==='visible'&&w.focused);
   if(looking)return;
  }catch{}
  await self.registration.showNotification(title,options);
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const target=event.notification.data;
 if(!target||!['direct','group'].includes(target.kind)||typeof target.id!=='string'||typeof target.uid!=='string')return;
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const client=windows.find(w=>w.url.startsWith(self.registration.scope));
  if(client){await client.focus();client.postMessage({type:'hung-open-chat',target});return}
  const url=new URL('./',self.registration.scope);url.searchParams.set('chat_kind',target.kind);url.searchParams.set('chat_id',target.id);url.searchParams.set('chat_user',target.uid);await self.clients.openWindow(url.href);
 })());
});
