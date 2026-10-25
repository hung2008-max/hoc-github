/* Cuộc gọi thoại / video 1–1 giữa bạn bè (WebRTC).
   - Tín hiệu kết nối (SDP/ICE) đi qua RPC chuoi_call; âm thanh và hình ảnh đi thẳng giữa hai thiết bị, không lưu trên máy chủ.
   - Mặc định chỉ dùng máy chủ STUN công khai. Mạng chặn kết nối trực tiếp cần thêm TURN: xem config.js (iceServers) và HUONG-DAN-CUOC-GOI.md. */
'use strict';
window.ChatCall=(()=>{
 const svg=d=>`<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
 const I={
  phone:svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
  video:svg('<rect x="2" y="6" width="13" height="12" rx="3"/><path d="m15 10 6-3v10l-6-3"/>'),
  mic:svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>'),
  micOff:svg('<path d="m3 3 18 18M9 9v2a3 3 0 0 0 5 2.2M15 9V5a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11 5.7M19 11a7 7 0 0 1-.6 2.8M12 18v4"/>'),
  cam:svg('<rect x="2" y="6" width="13" height="12" rx="3"/><path d="m15 10 6-3v10l-6-3"/>'),
  camOff:svg('<path d="m3 3 18 18M15 15v1a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h1M10 6h3a2 2 0 0 1 2 2v3l6-4v10"/>'),
  flip:svg('<path d="M20 7h-5l-1.5-2h-3L9 7H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z"/><path d="M9 13a3 3 0 0 1 5.5-1.6M15 13a3 3 0 0 1-5.5 1.6M14.5 10v1.5H13M9.5 16v-1.5H11"/>'),
  end:svg('<path d="M3 14c5-4 13-4 18 0l-1.5 3-4-1.2v-2.6a12 12 0 0 0-7 0v2.6L4.5 17z"/>')
 };
 const FINAL=['ended','declined','missed','cancelled'];
 const STUN=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}];
 const handled=new Set();let cur=null,incoming=null,incomingBusy=false,toneT=0,toneCtx=null,vibT=0,hideT=0,serial=0,lastNotice='';
 const dialog=document.createElement('dialog');
 dialog.id='callDialog';dialog.className='call-dialog';dialog.setAttribute('aria-label','Cuộc gọi');
 dialog.innerHTML='<video id="callRemote" class="call-remote" autoplay playsinline></video><div class="call-stage"><span id="callAvatar" class="call-avatar"></span><h2 id="callName"></h2><p id="callStatus" role="status"></p></div><video id="callLocal" class="call-local" autoplay playsinline muted></video><div id="callControls" class="call-controls"></div>';
 document.body.append(dialog);
 const el=id=>dialog.querySelector('#'+id);
 dialog.addEventListener('cancel',e=>e.preventDefault());
 dialog.addEventListener('click',()=>{const v=el('callRemote');if(v?.paused&&v.srcObject)v.play().catch(()=>{})});

 const supported=()=>!!(window.isSecureContext&&navigator.mediaDevices?.getUserMedia&&window.RTCPeerConnection);
 const name=p=>(p&&p.name)||'Bạn bè';
 const label=k=>k==='video'?'video':'thoại';
 async function rpc(action,payload){
  try{return await raw('/rest/v1/rpc/chuoi_call',{action,payload},await token())}
  catch(e){if(/chuoi_call|PGRST202/.test(e.message))throw Error('Cần chạy database/upgrade-cuoc-goi.sql trong Supabase để bật cuộc gọi.');throw e}
 }
 function mediaError(e){
  if(e&&e.name==='NotAllowedError')return 'Chưa được phép dùng micro/camera. Hãy bật quyền cho trang rồi thử lại.';
  if(e&&(e.name==='NotFoundError'||e.name==='OverconstrainedError'))return 'Không tìm thấy micro hoặc camera trên thiết bị.';
  if(e&&e.name==='NotReadableError')return 'Micro/camera đang được ứng dụng khác sử dụng.';
  return errText(e);
 }
 function getMedia(video){
  const audio={echoCancellation:true,noiseSuppression:true,autoGainControl:true};
  return navigator.mediaDevices.getUserMedia({audio,video:video?{facingMode:'user',width:{ideal:960},height:{ideal:720},frameRate:{ideal:24,max:30}}:false});
 }

 /* ---------- âm báo ---------- */
 function stopTone(){clearInterval(toneT);toneT=0;clearInterval(vibT);vibT=0;try{navigator.vibrate?.(0)}catch{}}
 function beep(freq,ms,gain=.08){
  try{
   toneCtx=toneCtx||new (window.AudioContext||window.webkitAudioContext)();if(toneCtx.state==='suspended')toneCtx.resume().catch(()=>{});
   const o=toneCtx.createOscillator(),g=toneCtx.createGain(),t=toneCtx.currentTime;o.type='sine';o.frequency.value=freq;
   g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+.03);g.gain.setValueAtTime(gain,t+ms/1000-.05);g.gain.linearRampToValueAtTime(0,t+ms/1000);
   o.connect(g).connect(toneCtx.destination);o.start(t);o.stop(t+ms/1000+.02);
  }catch{}
 }
 function tone(type){
  stopTone();
  if(type==='in'){const p=()=>{beep(880,350);setTimeout(()=>beep(660,350),420)};p();toneT=setInterval(p,2400);const v=()=>{try{navigator.vibrate?.([400,200,400])}catch{}};v();vibT=setInterval(v,2400)}
  if(type==='out'){const p=()=>beep(440,1000,.05);p();toneT=setInterval(p,3200)}
 }

 /* ---------- giao diện ---------- */
 function setStatus(t){const s=el('callStatus');if(s)s.textContent=t}
 function show(kind,peer,mode){
  clearTimeout(hideT);serial++;
  dialog.dataset.mode=mode;dialog.classList.toggle('is-video',kind==='video');dialog.classList.remove('has-remote','remote-cam-off','local-off','call-ended');
  el('callName').textContent=name(peer);el('callAvatar').innerHTML=peer?avatarHTML(peer):'';
  el('callLocal').srcObject=null;el('callRemote').srcObject=null;
  if(!dialog.open)dialog.showModal();
 }
 function hide(){if(dialog.open)dialog.close();el('callLocal').srcObject=null;el('callRemote').srcObject=null;dialog.classList.remove('has-remote','remote-cam-off','local-off','call-ended')}
 function controls(){
  const c=el('callControls'),me=cur;if(!c)return;
  if(!me){c.innerHTML='';return}
  const video=me.kind==='video'&&me.local?.getVideoTracks().length>0,canFlip=video&&navigator.maxTouchPoints>0;
  c.innerHTML=`<button type="button" data-act="mute" class="call-btn${me.muted?' off':''}" aria-pressed="${me.muted}" aria-label="${me.muted?'Bật micro':'Tắt micro'}">${me.muted?I.micOff:I.mic}</button>`+
   (video?`<button type="button" data-act="cam" class="call-btn${me.camOff?' off':''}" aria-pressed="${me.camOff}" aria-label="${me.camOff?'Bật camera':'Tắt camera'}">${me.camOff?I.camOff:I.cam}</button>`:'')+
   (canFlip?`<button type="button" data-act="flip" class="call-btn" aria-label="Đổi camera trước/sau">${I.flip}</button>`:'')+
   `<button type="button" data-act="end" class="call-btn end" aria-label="Kết thúc cuộc gọi">${I.end}</button>`;
  c.querySelectorAll('button').forEach(b=>b.onclick=e=>{e.stopPropagation();act(b.dataset.act)});
 }
 function incomingControls(){
  const c=el('callControls'),inc=incoming;if(!c||!inc)return;
  c.innerHTML=`<button type="button" data-act="decline" class="call-btn end" aria-label="Từ chối">${I.end}</button>`+
   `<button type="button" data-act="accept" class="call-btn accept" aria-label="${inc.kind==='video'?'Trả lời bằng video':'Trả lời'}">${inc.kind==='video'?I.video:I.phone}</button>`+
   (inc.kind==='video'?'<button type="button" data-act="accept-audio" class="call-link">Chỉ nghe, không bật camera</button>':'');
  c.querySelectorAll('button').forEach(b=>b.onclick=e=>{e.stopPropagation();act(b.dataset.act)});
 }
 function tick(me){
  if(me!==cur||!me.connectedAt)return;
  const s=Math.floor((Date.now()-me.connectedAt)/1000);setStatus(String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0'));
 }
 function syncButtons(){
  const busy=!!(cur||incoming);
  document.querySelectorAll('#callAudioBtn,#callVideoBtn').forEach(b=>{b.disabled=busy});
 }

 /* ---------- điều khiển trong cuộc gọi ---------- */
 async function act(a){
  if(a==='accept')return accept(true);
  if(a==='accept-audio')return accept(false);
  if(a==='decline')return decline();
  const me=cur;if(!me)return;
  if(a==='end')return hangup(me,'Bạn đã kết thúc cuộc gọi.');
  if(a==='mute'){me.muted=!me.muted;me.local?.getAudioTracks().forEach(t=>t.enabled=!me.muted);controls();sendInfo(me)}
  if(a==='cam'){me.camOff=!me.camOff;me.local?.getVideoTracks().forEach(t=>t.enabled=!me.camOff);dialog.classList.toggle('local-off',me.camOff);controls();sendInfo(me)}
  if(a==='flip')flip(me);
 }
 async function flip(me){
  const old=me.local?.getVideoTracks()[0];if(!old||!me.pc)return;
  const next=me.facing==='user'?'environment':'user';
  try{
   const s=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:next},width:{ideal:960},height:{ideal:720}}});
   const track=s.getVideoTracks()[0];if(!track||me.ended){s.getTracks().forEach(t=>t.stop());return}
   track.enabled=!me.camOff;
   const sender=me.pc.getSenders().find(x=>x.track&&x.track.kind==='video');if(sender)await sender.replaceTrack(track);
   me.local.removeTrack(old);old.stop();me.local.addTrack(track);me.facing=next;
   el('callLocal').srcObject=me.local;el('callLocal').classList.toggle('mirror',next==='user');
  }catch(e){toast('Không đổi được camera: '+mediaError(e))}
 }
 function sendInfo(me){if(me.id&&!me.ended)signal(me,'info',{cam:!me.camOff&&me.local?.getVideoTracks().length>0,mic:!me.muted}).catch(()=>{})}

 /* ---------- tín hiệu ---------- */
 const signal=(me,kind,payload)=>rpc('signal',{id:me.id,kind,payload});
 async function flushIce(me){
  if(!me.iceBuf.length||me.ended||!me.id)return;
  const list=me.iceBuf.splice(0,me.iceBuf.length);
  try{await signal(me,'ice',{c:list})}catch(e){if(!me.ended)me.iceBuf.unshift(...list)}
 }
 function newCall(o){
  return {id:'',fid:'',kind:'audio',role:'caller',peer:null,pc:null,local:null,remote:null,cursor:0,phase:'preparing',pollT:0,fails:0,iceBuf:[],iceT:0,pendingIce:[],hasRemote:false,
   connectedAt:0,timerT:0,connTimeout:0,discT:0,restartAt:0,muted:false,camOff:false,facing:'user',ended:false,...o};
 }
 function setupPeer(me){
  const pc=new RTCPeerConnection({iceServers:Array.isArray(config.iceServers)&&config.iceServers.length?config.iceServers:STUN,bundlePolicy:'max-bundle'});
  me.pc=pc;me.remote=new MediaStream();
  pc.ontrack=e=>{
   if(me.ended)return;
   if(e.streams&&e.streams[0])me.remote=e.streams[0];else if(!me.remote.getTracks().includes(e.track))me.remote.addTrack(e.track);
   const v=el('callRemote');if(v.srcObject!==me.remote)v.srcObject=me.remote;v.play().catch(()=>{});
   if(e.track.kind==='video')dialog.classList.add('has-remote');
  };
  for(const t of me.local.getTracks())pc.addTrack(t,me.local);
  pc.onicecandidate=e=>{if(e.candidate&&!me.ended){me.iceBuf.push(e.candidate.toJSON());clearTimeout(me.iceT);me.iceT=setTimeout(()=>flushIce(me),180)}};
  pc.onconnectionstatechange=pc.oniceconnectionstatechange=()=>onConnection(me);
  const lv=el('callLocal');lv.srcObject=me.local;lv.classList.toggle('mirror',true);
  dialog.classList.toggle('local-off',me.camOff);
 }
 function onConnection(me){
  if(me.ended||me!==cur||!me.pc)return;
  const st=me.pc.connectionState==='new'||!me.pc.connectionState?me.pc.iceConnectionState:me.pc.connectionState;
  if(st==='connected'||st==='completed'){
   clearTimeout(me.discT);clearTimeout(me.connTimeout);
   if(!me.connectedAt){me.connectedAt=Date.now();stopTone();me.timerT=setInterval(()=>tick(me),500);sendInfo(me)}
   me.phase='connected';tick(me);dialog.classList.remove('reconnecting');
  }else if(st==='disconnected'||st==='failed'){
   if(!me.connectedAt&&st==='disconnected')return;
   dialog.classList.add('reconnecting');setStatus('Kết nối không ổn định…');
   if(me.role==='caller'&&Date.now()-me.restartAt>5000){me.restartAt=Date.now();restartIce(me)}
   if(!me.discT)me.discT=setTimeout(()=>{if(!me.ended&&me===cur&&me.connectedAt&&me.pc&&!['connected','completed'].includes(me.pc.connectionState||me.pc.iceConnectionState))hangup(me,'Mất kết nối. Cuộc gọi đã kết thúc.')},15000);
  }
 }
 async function restartIce(me){
  try{const o=await me.pc.createOffer({iceRestart:true});await me.pc.setLocalDescription(o);await signal(me,'offer',{type:'offer',sdp:me.pc.localDescription.sdp})}catch{}
 }
 async function makeOffer(me){
  const o=await me.pc.createOffer();await me.pc.setLocalDescription(o);
  await signal(me,'offer',{type:'offer',sdp:me.pc.localDescription.sdp});
  flushIce(me);
 }
 async function addRemoteIce(me,c){
  if(!me.hasRemote){me.pendingIce.push(c);return}
  try{await me.pc.addIceCandidate(c)}catch{}
 }
 async function handleSignal(me,s){
  if(me.ended||!me.pc)return;
  const p=s.payload||{};
  if(s.kind==='offer'&&me.role==='callee'){
   await me.pc.setRemoteDescription({type:'offer',sdp:String(p.sdp||'')});me.hasRemote=true;
   const q=me.pendingIce.splice(0);for(const c of q)await addRemoteIce(me,c);
   const a=await me.pc.createAnswer();await me.pc.setLocalDescription(a);
   await signal(me,'answer',{type:'answer',sdp:me.pc.localDescription.sdp});flushIce(me);
  }else if(s.kind==='answer'&&me.role==='caller'){
   if(me.pc.signalingState!=='have-local-offer')return;
   await me.pc.setRemoteDescription({type:'answer',sdp:String(p.sdp||'')});me.hasRemote=true;
   const q=me.pendingIce.splice(0);for(const c of q)await addRemoteIce(me,c);
  }else if(s.kind==='ice'&&Array.isArray(p.c)){
   for(const c of p.c.slice(0,60))await addRemoteIce(me,c);
  }else if(s.kind==='info'){
   dialog.classList.toggle('remote-cam-off',p.cam===false&&me.kind==='video');
   if(p.mic===false)me.remoteMuted=true;else me.remoteMuted=false;
   dialog.classList.toggle('remote-muted',!!me.remoteMuted);
  }
 }
 function armConnectTimeout(me){
  clearTimeout(me.connTimeout);
  me.connTimeout=setTimeout(()=>{if(!me.ended&&me===cur&&!me.connectedAt)hangup(me,'Không kết nối được. Mạng của bạn hoặc bạn kia có thể chặn cuộc gọi trực tiếp (cần máy chủ TURN).')},35000);
 }
 function schedule(me,ms){clearTimeout(me.pollT);me.pollT=setTimeout(()=>poll(me),ms)}
 async function poll(me){
  if(me.ended||me!==cur||!me.id)return;
  try{
   const r=await rpc('poll',{id:me.id,after:me.cursor});me.fails=0;
   if(me.ended||me!==cur)return;
   for(const s of r.signals||[]){me.cursor=Math.max(me.cursor,s.id);try{await handleSignal(me,s)}catch(e){console.warn('call signal',e)}}
   if(FINAL.includes(r.status)){
    const who=name(me.peer);
    const text=r.status==='declined'?who+' đã từ chối cuộc gọi.':r.status==='missed'?'Không có người trả lời.':r.status==='cancelled'?'Cuộc gọi đã bị hủy.':'Cuộc gọi đã kết thúc.';
    return close(me,text);
   }
   if(r.status==='active'){
    if(me.role==='caller'&&me.phase==='ringing'){me.phase='connecting';stopTone();setStatus('Đang kết nối…');armConnectTimeout(me)}
    if(r.peer_age>30)return hangup(me,'Mất kết nối với '+name(me.peer)+'.');
   }
  }catch(e){
   me.fails++;if(me.fails>=8)return hangup(me,'Mất kết nối mạng. Cuộc gọi đã kết thúc.');
  }
  schedule(me,me.phase==='connected'?1800:800);
 }

 /* ---------- bắt đầu / kết thúc ---------- */
 function release(me){
  me.ended=true;clearTimeout(me.pollT);clearTimeout(me.iceT);clearTimeout(me.connTimeout);clearTimeout(me.discT);clearInterval(me.timerT);
  try{me.pc&&(me.pc.onicecandidate=me.pc.ontrack=me.pc.onconnectionstatechange=me.pc.oniceconnectionstatechange=null,me.pc.close())}catch{}
  me.local?.getTracks().forEach(t=>t.stop());
 }
 function close(me,text){
  if(me.ended&&cur!==me)return;
  release(me);if(cur===me)cur=null;stopTone();clearNotice();
  if(text){setStatus(text);dialog.classList.add('call-ended')}
  el('callControls').innerHTML='';el('callLocal').srcObject=null;
  const mine=serial;clearTimeout(hideT);hideT=setTimeout(()=>{if(mine===serial&&!cur&&!incoming)hide()},text?1600:0);
  syncButtons();
  if(me.fid&&selected?.id===me.fid)setTimeout(()=>window.refreshThread?.(true)?.catch?.(()=>{}),300);
 }
 async function hangup(me,text){
  if(me.ended)return;
  const id=me.id;close(me,text);
  if(id)try{await rpc('end',{id})}catch{}
 }
 async function start(kind){
  if(cur||incoming){toast('Bạn đang trong một cuộc gọi.');return}
  if(!selected||!profile||demo){toast('Hãy đăng nhập và mở chat với một người bạn để gọi.');return}
  if(!supported()){toast('Trình duyệt chưa hỗ trợ gọi. Hãy mở trang bằng HTTPS trên Safari hoặc Chrome mới.');return}
  const me=newCall({fid:selected.id,kind,role:'caller',peer:selected.peer});cur=me;syncButtons();
  show(kind,me.peer,'call');setStatus(kind==='video'?'Đang xin quyền micro và camera…':'Đang xin quyền micro…');controls();
  try{
   const stream=await getMedia(kind==='video');
   if(me.ended){stream.getTracks().forEach(t=>t.stop());return}
   me.local=stream;
   const r=await rpc('start',{friendship:me.fid,kind});me.id=r.id;
   if(me.ended){rpc('end',{id:me.id}).catch(()=>{});return}
   setupPeer(me);me.phase='ringing';setStatus('Đang gọi…');tone('out');controls();
   await makeOffer(me);schedule(me,500);
  }catch(e){
   if(me.ended)return;
   const id=me.id;close(me,'');hide();toast(mediaError(e));
   if(id)rpc('end',{id}).catch(()=>{});
  }
 }
 async function accept(withVideo){
  const inc=incoming;if(!inc||cur)return;
  handled.add(inc.id);incoming=null;stopTone();clearNotice();
  const me=newCall({id:inc.id,fid:inc.friendship,kind:inc.kind,role:'callee',peer:inc.peer,phase:'connecting'});cur=me;syncButtons();
  dialog.dataset.mode='call';setStatus('Đang xin quyền micro…');controls();
  try{
   let stream;
   try{stream=await getMedia(inc.kind==='video'&&withVideo)}
   catch(e){if(inc.kind==='video'&&withVideo&&e.name!=='NotAllowedError'){stream=await getMedia(false)}else throw e}
   if(me.ended){stream.getTracks().forEach(t=>t.stop());return}
   me.local=stream;if(!stream.getVideoTracks().length)me.camOff=true;
   await rpc('accept',{id:me.id});
   if(me.ended)return;
   setupPeer(me);setStatus('Đang kết nối…');controls();armConnectTimeout(me);sendInfo(me);schedule(me,50);
  }catch(e){
   if(me.ended)return;
   const id=me.id;close(me,'');hide();toast(mediaError(e));
   rpc('decline',{id}).catch(()=>{});
  }
 }
 async function decline(){
  const inc=incoming;if(!inc)return;
  handled.add(inc.id);incoming=null;stopTone();clearNotice();hide();syncButtons();
  try{await rpc('decline',{id:inc.id})}catch{}
 }

 /* ---------- cuộc gọi đến ---------- */
 function notify(inc){
  if(!document.hidden||!('Notification' in window)||Notification.permission!=='granted')return;
  lastNotice='hung-call-'+inc.id;
  const title=name(inc.peer)+' đang gọi '+label(inc.kind),opts={body:'Mở hungstrikes để trả lời',tag:lastNotice,icon:'./icon-192.png',badge:'./favicon-32.png',requireInteraction:true,renotify:true,data:{kind:'direct',id:inc.friendship,uid:profile.id}};
  /* Ưu tiên kênh thông báo chung của app (đã gồm công tắc thông báo thiết bị + đăng ký SW từ lúc đăng nhập). */
  if(window.MsgAlerts?.notifyNative){window.MsgAlerts.notifyNative(title,opts);return}
  navigator.serviceWorker?.getRegistration?.().then(r=>{if(r)r.showNotification(title,opts)}).catch(()=>{});
 }
 function clearNotice(){
  if(!lastNotice)return;const tag=lastNotice;lastNotice='';
  navigator.serviceWorker?.getRegistration?.().then(r=>r?.getNotifications?.({tag}).then(list=>list.forEach(n=>n.close()))).catch(()=>{});
 }
 function ring(call){
  const f=(typeof friends!=='undefined'?friends:[]).find(x=>x.id===call.friendship);
  incoming={...call,peer:f?f.peer:null};
  show(call.kind,incoming.peer,'incoming');setStatus('Cuộc gọi '+label(call.kind)+' đến…');incomingControls();tone('in');notify(incoming);syncButtons();
 }
 async function checkIncoming(){
  if(incomingBusy||!configured||demo||!profile||!session)return;
  if(cur)return;
  incomingBusy=true;
  try{
   const r=await rpc('incoming',{});const c=r&&r.call;
   if(cur)return;
   if(c&&handled.has(c.id)){}
   else if(c&&(!incoming||incoming.id!==c.id)){if(incoming)hide();ring(c)}
   else if(!c&&incoming){const had=incoming;incoming=null;stopTone();clearNotice();setStatus('Cuộc gọi nhỡ từ '+name(had.peer)+'.');dialog.classList.add('call-ended');el('callControls').innerHTML='';const mine=serial;hideT=setTimeout(()=>{if(mine===serial&&!cur&&!incoming)hide()},1800);syncButtons();if(had.friendship===selected?.id)window.refreshThread?.(true)?.catch?.(()=>{})}
  }catch{}
  finally{incomingBusy=false}
 }

 /* ---------- nút trên đầu cuộc trò chuyện ---------- */
 function mount(){
  const info=$('infoBtn');if(!info||$('callAudioBtn'))return;
  const a=document.createElement('button'),v=document.createElement('button');
  a.type=v.type='button';a.id='callAudioBtn';v.id='callVideoBtn';a.className=v.className='ic-btn head-ic call-start';
  a.setAttribute('aria-label','Gọi thoại');v.setAttribute('aria-label','Gọi video');a.title='Gọi thoại';v.title='Gọi video';
  a.innerHTML=I.phone;v.innerHTML=I.video;
  a.onclick=()=>start('audio');v.onclick=()=>start('video');
  info.before(a,v);syncButtons();
 }

 setInterval(checkIncoming,2500);
 window.addEventListener('pagehide',()=>{
  if(incoming&&!cur){try{fetch(config.url.replace(/\/$/,'')+'/rest/v1/rpc/chuoi_call',{method:'POST',keepalive:true,headers:{apikey:config.key,'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({action:'decline',payload:{id:incoming.id}})})}catch{}}
  const me=cur;if(!me)return;
  if(me.id){try{fetch(config.url.replace(/\/$/,'')+'/rest/v1/rpc/chuoi_call',{method:'POST',keepalive:true,headers:{apikey:config.key,'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},body:JSON.stringify({action:'end',payload:{id:me.id}})})}catch{}}
  release(me);cur=null;
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkIncoming()});
 return {mount,start,accept,decline,active:()=>!!(cur||incoming),state:()=>cur?{id:cur.id,phase:cur.phase,kind:cur.kind,role:cur.role,connected:!!cur.connectedAt}:null};
})();
