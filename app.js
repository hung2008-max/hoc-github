'use strict';
const FILE=location.protocol==='file:'||location.origin==='null';
const $=id=>document.getElementById(id), config=window.CHUOI_CONFIG||{}, configured=/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url||'')&&!!config.key;
const EMPTY_AVATAR='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" rx="100" fill="#eeebff"/><circle cx="100" cy="76" r="32" fill="#8c81e8"/><path d="M42 177a58 58 0 0 1 116 0" fill="#8c81e8"/></svg>');
let session=null,profile=null,demo=false,signup=false,revision=0,currentState=null,lastSaved='',saveTimer,saveBusy=false,saveBlocked=false,refreshPromise=null,friends=[],selected=null,activePage='home',pollTimer,threadBusy=false,adminPage=0,toastTimer,avatarDraft='',threadData=null,pendingSave=false;
const normFC=v=>String(v||'').toUpperCase().replace(/[^0-9A-Z]/g,'');
const fmtFC=c=>{c=normFC(c);return c.length===8?c.slice(0,4)+'-'+c.slice(4):c};
const inviteLink=c=>location.origin.replace(/^null$/,'')+location.pathname+'?kb='+normFC(c);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const photo=s=>/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s||'')?s:EMPTY_AVATAR;
const avatarHTML=p=>`<span class="avatar"><img src="${esc(photo(p.avatar))}" alt=""></span>`;
const avBadge=n=>n>0?`<i class="av-badge" aria-label="${n} tin chưa đọc">${n>99?'99+':n}</i>`:'';
const avatarBadged=(p,n)=>`<span class="av-wrap">${avatarHTML(p)}${avBadge(n)}</span>`;
const peerUnread=id=>(selected?.id===id&&activePage==='chat')?0:Number(unreadMap[id]||0);

const norm=t=>String(t??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase();
const ICON={
 mail:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 8 8 6 8-6"/></svg>',
 user:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
 hash:'<svg viewBox="0 0 24 24"><path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16"/></svg>',
 cal:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
 target:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
 flag:'<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
 cam:'<svg viewBox="0 0 24 24"><path d="M8 5 10 3h4l2 2h4a2 2 0 0 1 2 2v12H2V7a2 2 0 0 1 2-2Z"/><circle cx="12" cy="12" r="4"/></svg>',
 info:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>',
 plus:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
 chart:'<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
 pen:'<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/></svg>',
 copy:'<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="3"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>'
};
function localDay(){const d=new Date();return Math.round(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/864e5)}
function myStats(s){
 const start=Number(s?.start),days=Number.isFinite(start)?Math.max(0,localDay()-start):0,goal=Math.max(1,Number(s?.goal)||100),fl=Array.isArray(s?.fl)?s.fl:[];
 let best=Number(s?.best)||0,last=null;
 fl.forEach(f=>{if(Number(f.len)>best)best=Number(f.len);if(!last||Number(f.d)>Number(last.d))last=f});
 if(days>best)best=days;
 const c=n=>Math.max(0,Math.min(99999,Math.round(n)||0));
 return {days:c(days),goal:Math.max(1,c(goal)),best:c(best),fails:c(fl.length),last}
}
const CARD_RE=/^\[\[chiase\|(\d{1,5})\|(\d{1,5})\|(\d{1,5})\|(\d{1,5})\]\]$/;
function parseCard(b){const m=CARD_RE.exec(String(b||'').trim());return m?{days:+m[1],goal:Math.max(1,+m[2]),best:+m[3],fails:+m[4]}:null}
function cardHTML(c){
 const pct=Math.max(0,Math.min(100,Math.round(c.days/c.goal*100)));
 return `<div class="share-card" role="group" aria-label="Chia sẻ chuỗi"><span class="sc-tag">✦ CHIA SẺ CHUỖI</span><div class="sc-main"><b>${c.days}</b><span>ngày · chuỗi hiện tại</span></div><div class="sc-bar" aria-hidden="true"><i style="width:${pct}%"></i></div><div class="sc-goal">${pct}% mục tiêu ${c.goal} ngày</div><div class="sc-stats"><div><b>${c.best}</b><small>Kỷ lục chuỗi</small></div><div><b>${c.fails}</b><small>Lần thất bại</small></div></div></div>`
}
function linkify(t){
 const re=/https?:\/\/[^\s<>"']+/gi;let out='',i=0,m;
 while((m=re.exec(t))){const u=m[0].replace(/[.,;:!?)\]]+$/,'');out+=esc(t.slice(i,m.index))+`<a class="lnk" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`;i=m.index+u.length;re.lastIndex=i}
 return out+esc(t.slice(i))
}
const previewText=b=>{const special=window.ChatSocial?.preview(b);if(special)return special;const c=parseCard(b);return c?'📊 Chuỗi '+c.days+' ngày · đã chia sẻ':String(b).replace(/\s+/g,' ')};
function toast(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5500)}
function errText(e){let m=e.message||'Không thể kết nối. Vui lòng thử lại.';if(m.includes('Invalid login credentials'))return 'Email hoặc mật khẩu chưa đúng.';if(m.includes('Email not confirmed'))return 'Hãy xác nhận email trước khi đăng nhập.';if(m.includes('Failed to fetch'))return 'Không có kết nối máy chủ. Kiểm tra mạng rồi thử lại.';return m}
function wrap(fn){return async e=>{if(e)e.preventDefault();try{await fn(e)}catch(x){toast(errText(x))}}}
const remembered=()=>{try{return localStorage.getItem('chuoi_remember')!=='0'}catch{return true}};
function readSession(){for(const st of [localStorage,sessionStorage]){try{const v=JSON.parse(st.getItem('chuoi_session')||'null');if(v?.refresh_token)return v}catch{}}return null}
function storeSession(s){
 session=s?.access_token?{access_token:s.access_token,refresh_token:s.refresh_token,expires_at:Date.now()+((s.expires_in||3600)*1000),user:s.user?{email:s.user.email}:(session?.user||undefined)}:null;
 try{localStorage.removeItem('chuoi_session');sessionStorage.removeItem('chuoi_session')}catch{}
 if(session){try{(remembered()?localStorage:sessionStorage).setItem('chuoi_session',JSON.stringify(session))}catch{}}
}
async function raw(path,body,token,method='POST'){
 const r=await fetch(config.url.replace(/\/$/,'')+path,{method,headers:{apikey:config.key,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.msg||data.message||data.error_description||data.error||'Lỗi máy chủ '+r.status);return data;
}
async function token(){if(!session)throw new Error('Vui lòng đăng nhập lại.');if(session.expires_at>Date.now()+60000)return session.access_token;if(!refreshPromise)refreshPromise=raw('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token}).then(storeSession).finally(()=>refreshPromise=null);await refreshPromise;return session.access_token}
async function api(action,payload={}){if(demo)throw new Error('Đây là bản xem thử. Kết nối Supabase để sử dụng tài khoản và bạn bè thật.');return raw('/rest/v1/rpc/chuoi_api',{action,payload},await token())}
function setAuthMode(v){signup=v;$('nameLabel').hidden=!v;$('fullName').required=v;$('loginTab').hidden=!v;$('signupTab').hidden=v;$('forgot').hidden=v;$('authTitle').textContent=v?'Tạo tài khoản':'Đăng nhập';$('authSubmit').textContent=v?'Đăng ký':'Đăng nhập';$('password').autocomplete=v?'new-password':'current-password';$('password').placeholder=v?'Mật khẩu (ít nhất 8 ký tự)':'Mật khẩu';$('authStatus').textContent=''}
$('loginTab').onclick=()=>setAuthMode(false);$('signupTab').onclick=()=>setAuthMode(true);
$('showPassword').onclick=()=>{const show=$('password').type==='password';$('password').type=show?'text':'password';$('showPassword').textContent=show?'Ẩn':'Hiện'};
$('authForm').onsubmit=async e=>{e.preventDefault();try{localStorage.setItem('chuoi_remember',$('rememberMe').checked?'1':'0');if($('rememberMe').checked)localStorage.setItem('chuoi_last_email',$('email').value.trim());else localStorage.removeItem('chuoi_last_email')}catch{}if(!configured){$('authStatus').textContent='Chủ website chưa kết nối Supabase. Bạn có thể xem thử giao diện bên dưới.';return}$('authSubmit').disabled=true;$('authStatus').textContent='Đang kết nối…';try{let s=await raw(signup?'/auth/v1/signup':'/auth/v1/token?grant_type=password',{email:$('email').value.trim(),password:$('password').value,...(signup?{data:{full_name:$('fullName').value.trim()}}:{})});$('password').value='';if(!s.access_token){showOtp();return}storeSession(s);await enter()}catch(x){if((x.message||'').includes('Email not confirmed')){showOtp();return}$('authStatus').textContent=errText(x)}finally{$('authSubmit').disabled=false}};
function showOtp(){$('authForm').hidden=true;$('otpForm').hidden=false;$('otpInfo').textContent='Đã gửi mã xác nhận tới '+$('email').value.trim()+'. Nhập mã số trong email (xem cả Spam).';$('authStatus').textContent='';$('otpCode').value='';$('otpCode').focus()}
$('otpBack').onclick=()=>{$('otpForm').hidden=true;$('authForm').hidden=false;$('authStatus').textContent=''};
$('otpResend').onclick=async()=>{try{await raw('/auth/v1/resend',{type:'signup',email:$('email').value.trim()});$('authStatus').textContent='Đã gửi lại mã. Mã cũ không còn dùng được.'}catch(x){$('authStatus').textContent=errText(x)}};
$('otpForm').onsubmit=async e=>{e.preventDefault();$('otpSubmit').disabled=true;$('authStatus').textContent='Đang xác nhận…';try{let s=await raw('/auth/v1/verify',{type:'signup',email:$('email').value.trim(),token:$('otpCode').value.trim()});if(!s.access_token)throw new Error('Không xác nhận được. Thử đăng nhập lại.');$('otpForm').hidden=true;$('authForm').hidden=false;$('authStatus').textContent='';storeSession(s);await enter()}catch(x){$('authStatus').textContent=(x.message||'').match(/expired|invalid/i)?'Mã sai hoặc đã hết hạn. Bấm “Gửi lại mã”.':errText(x)}finally{$('otpSubmit').disabled=false}};
$('forgot').onclick=wrap(async()=>{if(!configured)throw new Error('Chủ website chưa kết nối Supabase.');if(!$('email').validity.valid||!$('email').value)throw new Error('Nhập email của bạn vào ô Email trước.');await raw('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin+location.pathname),{email:$('email').value.trim()});$('authStatus').textContent='Nếu email đã đăng ký, bạn sẽ nhận được liên kết đặt lại mật khẩu.'});
$('resetForm').onsubmit=wrap(async()=>{await raw('/auth/v1/user',{password:$('newPassword').value},await token(),'PUT');$('newPassword').value='';$('resetDialog').close();toast('Đã đổi mật khẩu.');await enter()});$('cancelReset').onclick=()=>$('resetDialog').close();
async function enter(){demo=false;const b=await api('boot');profile=b.profile;profile.email=session?.user?.email||'';currentState=b.state;revision=b.revision;const prevSync=lsGet();lsSet(Date.now());showApp();window.MsgAlerts?.start();loadEmail();const d=JSON.parse(localStorage.getItem('chuoi_draft_'+profile.id)||'null');if(d?.state&&JSON.stringify(d.state)!==JSON.stringify(currentState)){syncProblem('Có bản nháp chưa đồng bộ trên thiết bị. Bấm “Xuất bản nháp” để giữ lại trước khi tiếp tục.');saveBlocked=true;currentState=d.state;lsSet(prevSync);mountTracker()}await loadFriends();pollInbox();inboxTimer=setInterval(()=>{if(!document.hidden)pollInbox()},15000);pollTimer=setInterval(()=>{if(document.hidden)return;if(activePage==='chat'&&selected)refreshThread().catch(e=>{$('connection').textContent='Mất kết nối chat · đang thử lại'});else if(activePage==='chat')loadFriends().catch(()=>{});else if(activePage==='friends')loadFriends().catch(()=>{})},5000)}
function showApp(){lastSaved=JSON.stringify(currentState);saveBlocked=false;pendingSave=false;$('syncWarning').hidden=true;$('auth').hidden=true;$('app').hidden=false;$('demoBanner').hidden=!demo;$('connection').textContent=demo?'Chế độ xem thử':'Đã kết nối';$('adminOpen').hidden=demo||!profile.admin;drawProfile();mountTracker();switchPage('home');bkLoad();handleInviteLink()}
function lsGet(){try{return +localStorage.getItem('chuoi_lastsync_'+profile.id)||0}catch{return 0}}
function lsSet(t,push){try{localStorage.setItem('chuoi_lastsync_'+profile.id,String(t))}catch{}if(push)postTracker({kind:'sync-info',at:t})}
function mountTracker(){const boot={origin:FILE?'null':location.origin,uid:profile.id,name:profile.name,avatar:photo(profile.avatar),state:currentState,release:window.CHUOI_RELEASE,lastSync:demo?0:lsGet()};const script='window.CHUOI_BOOT='+JSON.stringify(boot).replace(/</g,'\\u003c')+';';$('tracker').srcdoc=window.CHUOI_TRACKER.replace('/*BOOT*/',script)}
const COVERS=['linear-gradient(135deg,#5145e8,#9a4dff)','linear-gradient(135deg,#ff9a3c,#ff5e62)','linear-gradient(135deg,#00b09b,#2dd4bf)','linear-gradient(135deg,#1e3c72,#2a5298)','linear-gradient(135deg,#f093fb,#f5576c)','linear-gradient(135deg,#232526,#414345)'];
const coverKey=()=>'chuoi_cover_'+(profile?.id||'');
function coverIdx(){try{return (parseInt(localStorage.getItem(coverKey()),10)||0)%COVERS.length}catch{return 0}}
$('coverBtn').onclick=()=>{try{localStorage.setItem(coverKey(),String((coverIdx()+1)%COVERS.length))}catch{}renderProfileExtras()};
function drawProfile(){
 const av=photo(profile.avatar);
 $('topAvatar').innerHTML=`<img src="${esc(av)}" alt="">`;
 $('profileAvatar').innerHTML=`<img src="${esc(av)}" alt="Ảnh của bạn">`;
 $('profileName').value=profile.name;avatarDraft=profile.avatar;$('myCode').textContent=fmtFC(profile.code);
 $('tracker').contentWindow?.postMessage({kind:'profile-update',name:profile.name,avatar:av},location.origin==='null'?'*':location.origin);
 renderProfileExtras()
}
const fmtDay=n=>new Date(n*864e5).toLocaleDateString('vi-VN',{timeZone:'UTC'});
function renderProfileExtras(){
 if(!profile)return;
 const s=myStats(currentState),acc=friends.filter(f=>f.status==='accepted'),email=profile.email||'',gmail=/@(gmail|googlemail)\.com$/i.test(email);
 $('profCover').style.background=COVERS[coverIdx()];
 $('profName').textContent=profile.name;
 $('profEmail').innerHTML=email?`${esc(email)}${gmail?' <i class="gm-badge">Gmail</i>':''}`:(demo?'Chưa đăng nhập tài khoản':'Đang tải email…');
 $('profJoined').textContent=profile.created_at?'Tham gia từ '+new Date(profile.created_at).toLocaleDateString('vi-VN'):'';
 $('stDays').textContent=s.days;$('stBest').textContent=s.best;$('stFails').textContent=s.fails;$('stFriends').textContent=acc.length;
 $('friendsCount').textContent=acc.length?'· '+acc.length:'';
 $('profFriends').innerHTML=acc.length?acc.slice(0,6).map(f=>`<button type="button" class="pf" data-pf="${esc(f.id)}">${avatarHTML(f.peer)}<span>${esc(f.peer.name)}</span></button>`).join(''):'<p class="fine">Chưa có bạn bè nào. Gửi mã kết bạn của bạn để bắt đầu.</p>';
 document.querySelectorAll('[data-pf]').forEach(b=>b.onclick=()=>openThread(b.dataset.pf))
}
async function loadEmail(){
 if(demo||!profile||profile.email)return;
 try{const u=await raw('/auth/v1/user',undefined,await token(),'GET');if(profile&&u?.email){profile.email=u.email;renderProfileExtras()}}catch{}
}
async function copyCode(){await navigator.clipboard.writeText(fmtFC(profile.code));toast('Đã sao chép mã kết bạn.')}
async function shareInvite(){
 const text=`Kết bạn với mình trên Chuỗi nhé! Mã kết bạn của mình: ${fmtFC(profile.code)}`,url=inviteLink(profile.code);
 if(navigator.share){try{await navigator.share({title:'Kết bạn trên Chuỗi',text,url});return}catch(e){if(e?.name==='AbortError')return}}
 await navigator.clipboard.writeText(text+'\n'+url);toast('Đã sao chép lời mời kèm đường dẫn. Dán gửi cho bạn bè.')
}
$('shareInvite').onclick=wrap(shareInvite);
function showFound(p){
 $('searchResult').innerHTML=p?`<div class="person">${avatarHTML(p)}<div class="details"><b>${esc(p.name)}</b><small>${esc(fmtFC(p.code))}</small></div><button id="sendRequest" class="primary">Kết bạn</button></div>`:'<p class="muted">Chưa tìm thấy. Kiểm tra lại mã bạn bè nhé.</p>';
 if(p)$('sendRequest').onclick=wrap(async()=>{await api('request',{code:p.code});$('searchResult').innerHTML='';$('friendCode').value='';await loadFriends();toast('Đã gửi lời mời kết bạn.')})
}
async function findFriend(code,silent){
 code=normFC(code);if(code.length<6)return;
 if(code===normFC(profile?.code)){if(!silent)$('searchResult').innerHTML='<p class="muted">Đây là mã của chính bạn. Hãy gửi mã này cho bạn bè.</p>';return}
 const p=await api('find',{code});if(p||!silent)showFound(p);else $('searchResult').innerHTML=''
}
$('friendCode').oninput=e=>{const c=normFC(e.target.value).slice(0,12);e.target.value=c.length>4&&c.length<=8?c.slice(0,4)+'-'+c.slice(4):c;if(c.length===8)findFriend(c,true).catch(()=>{})};
function handleInviteLink(){let kb='';try{kb=sessionStorage.getItem('chuoi_kb')||'';sessionStorage.removeItem('chuoi_kb')}catch{}if(!kb)return;switchPage('friends');$('friendCode').value=fmtFC(kb);findFriend(kb,false).catch(e=>toast(errText(e)))}

function openEdit(open=true){$('editPanel').hidden=!open;if(open){$('profileName').value=profile.name;$('profileName').focus();$('editPanel').scrollIntoView({block:'nearest',behavior:'smooth'})}}
$('editProfile').onclick=()=>openEdit($('editPanel').hidden);
$('cancelEdit').onclick=()=>openEdit(false);
$('shareCode').onclick=wrap(copyCode);
$('seeFriends').onclick=()=>switchPage('friends');
// ===== Sao lưu: đám mây (mã khôi phục) + file trên thiết bị + xoá dữ liệu =====
const BKA='23456789ABCDEFGHJKLMNPQRSTUVWXYZ',p2=n=>String(n).padStart(2,'0');
let bkInfo={code:'',last:0,loaded:false,err:false},bkPend=null,bkUndoS=null,bkBusy=false,bkRst=false,bkRstT;
const bkKey=()=>'chuoi_backup_'+(profile?.id||'');
const bkLocal=()=>{try{return JSON.parse(localStorage.getItem(bkKey()))||{}}catch{return {}}};
const bkSetLocal=o=>{try{localStorage.setItem(bkKey(),JSON.stringify({...bkLocal(),...o}))}catch{}};
const bkWhen=ms=>{const d=new Date(ms);return `${p2(d.getHours())}:${p2(d.getMinutes())} ${p2(d.getDate())}/${p2(d.getMonth()+1)}/${d.getFullYear()}`};
const bkFmtCode=c=>String(c||'').replace(/(.{4})(?=.)/g,'$1-');
const bkValid=d=>!!d&&typeof d==='object'&&Number.isFinite(d.start)&&Array.isArray(d.fl);
const bkSummary=d=>`bắt đầu ${fmtDay(Number(d.start))} · ${d.fl.length} lần thất bại · ${d.photos&&typeof d.photos==='object'?Object.keys(d.photos).length:0} ngày có ảnh`;
function bkMsg(text,kind){const m=$('bkMsg');m.textContent=text||'';m.className='bk-msg'+(kind?' '+kind:'')}
const bkRun=fn=>async e=>{if(e&&e.preventDefault)e.preventDefault();try{await fn(e)}catch(x){bkMsg(errText(x),'err')}};
async function bapi(action,payload={}){
 if(demo)throw new Error('Đây là bản xem thử. Hãy đăng nhập tài khoản thật để dùng sao lưu đám mây.');
 try{return await raw('/rest/v1/rpc/chuoi_backup',{action,payload},await token())}
 catch(x){if(/chuoi_backup/.test(x.message||'')&&/(find|exist|schema cache)/i.test(x.message||''))throw new Error('Chưa cài sao lưu đám mây: hãy chạy file database/backup-upgrade.sql trong Supabase SQL Editor.');throw x}
}
function bkDraw(){
 if(!profile)return;
 const l=bkLocal(),cloud=bkInfo.last||0,file=l.file||0,last=Math.max(cloud,file),old=!last||Date.now()-last>7*864e5;
 $('bkSt').className='bk-st'+(old?' warn':'');
 $('bkStT').innerHTML=`Đám mây: <b>${cloud?bkWhen(cloud):'chưa có'}</b><br>File: <b>${file?bkWhen(file):'chưa có'}</b>`+(last&&old?'<br>Đã hơn 7 ngày chưa sao lưu. Hãy sao lưu ngay.':'');
 $('bkCode').hidden=!bkInfo.code;$('bkCodeV').textContent=bkFmtCode(bkInfo.code);
 $('bkAuto').checked=!!l.auto;
}
async function bkLoad(){
 bkInfo={code:'',last:0,loaded:false,err:false};bkPend=null;bkUndoS=null;
 $('bkCf').hidden=true;$('bkVers').innerHTML='';$('bkUndo').hidden=true;bkMsg('');bkDraw();
 if(demo)return;
 try{const r=await bapi('status');bkInfo={code:r.code||'',last:r.last?Date.parse(r.last):0,loaded:true,err:false};if(typeof r.auto==='boolean')bkSetLocal({auto:r.auto})}
 catch(x){bkInfo.err=true;bkMsg(errText(x),'err')}
 bkDraw();bkAutoRun()
}
async function bkCloudRun(silent){
 if(bkBusy)return;
 if(demo)throw new Error('Đây là bản xem thử. Hãy đăng nhập tài khoản thật để dùng sao lưu đám mây.');
 if(!currentState)throw new Error('Chưa có dữ liệu để sao lưu.');
 bkBusy=true;$('bkCloud').disabled=true;if(!silent)bkMsg('Đang sao lưu…');
 try{
  await flushSave();
  const r=await bapi('create',{data:JSON.parse(JSON.stringify(currentState))});
  bkInfo={code:r.code,last:Date.parse(r.last),loaded:true,err:false};bkDraw();
  if(!silent)bkMsg('Đã sao lưu lên đám mây.','ok')
 }finally{bkBusy=false;$('bkCloud').disabled=false}
}
function bkAutoRun(){if(demo||!profile||bkBusy||!bkInfo.loaded||bkInfo.err||!bkLocal().auto)return;if(Date.now()-(bkInfo.last||0)>864e5)bkCloudRun(true).catch(()=>{})}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)bkAutoRun()});
$('bkCloud').onclick=bkRun(()=>bkCloudRun(false));
$('bkAuto').onchange=bkRun(async()=>{const on=$('bkAuto').checked;bkSetLocal({auto:on});if(!demo)await bapi('auto',{enabled:on});bkMsg(on?'Sẽ tự động sao lưu mỗi ngày.':'Đã tắt tự động sao lưu.','ok');if(on)bkAutoRun()});
$('bkCopy').onclick=bkRun(async()=>{const c=bkFmtCode(bkInfo.code);if(!c)return;try{await navigator.clipboard.writeText(c);bkMsg('Đã sao chép mã khôi phục.','ok')}catch{bkMsg('Mã khôi phục: '+c)}});
function bkAsk(data,label,code){
 bkPend={data,code};
 $('bkCfT').innerHTML=`<b>Khôi phục bản ${esc(label)}?</b><br><span class="muted">${esc(bkSummary(data))}. Toàn bộ dữ liệu hiện tại sẽ được thay thế (có thể hoàn tác).</span>`;
 $('bkCf').hidden=false;$('bkCf').scrollIntoView({block:'nearest',behavior:'smooth'})
}
async function bkApply(data){
 if(saveBusy)throw new Error('Đang đồng bộ, hãy đợi một chút rồi thử lại.');
 if(!demo&&saveBlocked)throw new Error('Hãy xử lý bản nháp chưa đồng bộ trước (Xuất bản nháp / Tải bản trên máy chủ).');
 bkUndoS=currentState;
 currentState=JSON.parse(JSON.stringify(data));
 mountTracker();
 $('bkUndo').hidden=!bkUndoS;
 await flushSave()
}
$('bkFind').onclick=bkRun(async()=>{
 const c=$('bkIn').value.toUpperCase().replace(/[^0-9A-Z]/g,'');
 if(c.length!==12||[...c].some(x=>!BKA.includes(x)))throw new Error('Mã khôi phục gồm 12 ký tự, dạng XXXX-XXXX-XXXX.');
 bkMsg('Đang tìm bản sao lưu…');$('bkVers').innerHTML='';$('bkCf').hidden=true;bkPend=null;
 const r=await bapi('versions',{code:c});
 if(!r.found||!r.versions?.length){bkMsg('Không tìm thấy mã này. Kiểm tra lại từng ký tự.','err');return}
 bkMsg('Chọn bản muốn khôi phục:');
 $('bkVers').innerHTML=r.versions.map((v,i)=>{const t=Date.parse(v.created_at);return `<button type="button" class="bk-v" data-id="${Number(v.id)}" data-code="${esc(c)}" data-t="${t}"><span><b>${bkWhen(t)}</b>${i===0?' · mới nhất':''}<br><small>${Number(v.days)||0} ngày chuỗi · ${Number(v.photos)||0} ngày có ảnh · ${Math.max(1,Math.round((Number(v.size)||0)/1024))} KB</small></span><span>›</span></button>`}).join('')
});
$('bkIn').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('bkFind').click()}};
$('bkVers').onclick=bkRun(async ev=>{
 const b=ev.target.closest?.('button[data-id]');if(!b)return;
 bkMsg('Đang tải bản sao lưu…');
 const r=await bapi('get',{code:b.dataset.code,id:Number(b.dataset.id)});
 if(!r.found||!bkValid(r.data))throw new Error('Bản sao lưu bị hỏng hoặc không tồn tại.');
 bkMsg('');bkAsk(r.data,'đám mây lúc '+bkWhen(Date.parse(r.created_at)),b.dataset.code)
});
$('bkYes').onclick=bkRun(async()=>{
 if(!bkPend)return;const {data}=bkPend;bkPend=null;$('bkCf').hidden=true;
 await bkApply(data);$('bkIn').value='';$('bkVers').innerHTML='';bkMsg('Đã khôi phục toàn bộ dữ liệu.','ok');toast('Đã khôi phục dữ liệu.')
});
$('bkNo').onclick=()=>{bkPend=null;$('bkCf').hidden=true;bkMsg('')};
$('bkUndo').onclick=bkRun(async()=>{
 if(!bkUndoS)return;const prev=bkUndoS;bkUndoS=null;
 await bkApply(prev);bkUndoS=null;$('bkUndo').hidden=true;bkMsg('Đã hoàn tác, dữ liệu cũ đã trở lại.','ok')
});
$('bkDown').onclick=bkRun(async()=>{
 if(!currentState)throw new Error('Chưa có dữ liệu để sao lưu.');
 const t=new Date(),name=`chuoi-sao-luu-${t.getFullYear()}-${p2(t.getMonth()+1)}-${p2(t.getDate())}.json`,blob=new Blob([JSON.stringify({app:'chuoi',version:1,exportedAt:t.toISOString(),data:currentState})],{type:'application/json'});
 const done=()=>{bkSetLocal({file:Date.now()});bkDraw();bkMsg(`Đã tạo file ${name}. Hãy cất ở nơi an toàn (Drive, iCloud, email…).`,'ok')};
 let file;try{file=new File([blob],name,{type:'application/json'})}catch{}
 if(file&&navigator.canShare?.({files:[file]})&&/iP(hone|ad|od)|Android/.test(navigator.userAgent)){
  try{await navigator.share({files:[file],title:'Sao lưu Chuỗi'});done()}catch(e){if(e?.name!=='AbortError')throw new Error('Không chia sẻ được file.')}
  return
 }
 const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);done()
});
$('bkUp').onclick=()=>$('bkFile').click();
$('bkFile').onchange=bkRun(async()=>{
 const f=$('bkFile').files?.[0];$('bkFile').value='';if(!f)return;
 const text=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=()=>no(new Error('Không đọc được file.'));r.readAsText(f)});
 let j;try{j=JSON.parse(text)}catch{throw new Error('File không phải bản sao lưu hợp lệ.')}
 const d=j&&j.data&&j.app==='chuoi'?j.data:j;
 if(!bkValid(d))throw new Error('File không phải bản sao lưu hợp lệ.');
 bkMsg('');bkAsk(d,'file'+(j.exportedAt&&!isNaN(Date.parse(j.exportedAt))?' ngày '+bkWhen(Date.parse(j.exportedAt)):''),null)
});
$('bkReset').onclick=bkRun(async()=>{
 const b=$('bkReset');
 if(!bkRst){bkRst=true;b.textContent='Chắc chắn xoá chuỗi? Bạn bè vẫn được giữ. Bấm lần nữa';bkRstT=setTimeout(()=>{bkRst=false;b.textContent='Xoá dữ liệu chuỗi'},4000);return}
 clearTimeout(bkRstT);bkRst=false;b.textContent='Xoá dữ liệu chuỗi';
 if(saveBusy)throw new Error('Đang đồng bộ, hãy đợi một chút rồi thử lại.');
 if(!demo&&saveBlocked)throw new Error('Hãy xử lý bản nháp chưa đồng bộ trước.');
 bkUndoS=currentState;$('bkUndo').hidden=false;
 postTracker({kind:'reset-all'});
 bkMsg(demo?'Đã xoá dữ liệu chuỗi. Bạn bè và tin nhắn vẫn nguyên.':'Đã xoá dữ liệu chuỗi. Bạn bè, tin nhắn và các bản sao lưu đám mây vẫn được giữ. Có thể bấm Hoàn tác.','ok')
});

function switchPage(p){if(p!=='chat')window.closeGroupChat?.();if(p!=='home')postTracker({kind:'close-overlays'});activePage=p;document.body.dataset.view=p;document.body.classList.toggle('thread-open',p==='chat'&&!!selected);for(const k of ['home','friends','chat','profile','admin'])$(k+'Page').hidden=k!==p;document.querySelectorAll('[data-page]').forEach(b=>{b.classList.toggle('active',b.dataset.page===p);b.setAttribute('aria-current',b.dataset.page===p?'page':'false')});if(p==='friends'||p==='chat'){if(demo){renderFriends();renderChatList()}else loadFriends().catch(e=>toast(errText(e)))}if(p==='admin')loadAdmin().catch(e=>toast(errText(e)));if(p==='profile')renderProfileExtras();window.scrollTo({top:0})}
for(const b of document.querySelectorAll('[data-page]'))b.onclick=()=>{if(b.dataset.page==='chat'&&activePage==='chat'&&selected)closeThread();switchPage(b.dataset.page)};
function postTracker(m){const w=$('tracker').contentWindow;if(w)w.postMessage(m,(location.protocol==='file:'||location.origin==='null')?'*':location.origin)}
function openSheet(){if(!profile)return;$('sheet').hidden=false;$('sheetCamera').focus()}
function closeSheet(restore=true){if($('sheet').hidden)return;$('sheet').hidden=true;if(restore)$('captureBtn').focus()}
$('captureBtn').onclick=openSheet;
$('sheet').addEventListener('click',e=>{if(e.target.closest('[data-close]'))closeSheet()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet();if(e.key==='Tab'&&!$('sheet').hidden){const f=[...$('sheet').querySelectorAll('button')],i=f.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&i===f.length-1){e.preventDefault();f[0].focus()}}});
$('sheetCamera').onclick=()=>{closeSheet(false);switchPage('home');postTracker({kind:'open-camera'})};
$('sheetUpload').onclick=()=>{closeSheet(false);$('photoFile').click()};
$('photoFile').onchange=()=>{const fs=[...$('photoFile').files];$('photoFile').value='';if(!fs.length)return;switchPage('home');fs.forEach(f=>postTracker({kind:'photo-file',file:f}))};
$('topAvatar').onclick=()=>switchPage('profile');$('adminOpen').onclick=()=>switchPage('admin');
window.addEventListener('message',e=>{if(e.source!==$('tracker').contentWindow||(e.origin!==location.origin&&!(FILE&&e.origin==='null'))||!profile)return;if(e.data.kind==='edit-profile'){switchPage('profile');openEdit(true)}if(e.data.kind==='open-capture')openSheet();if(e.data.kind==='toast'&&typeof e.data.text==='string')toast(e.data.text.slice(0,200));if(e.data.kind==='sync-now')flushSave();if(e.data.kind==='chuoi-state'){currentState=e.data.state;if(activePage==='profile')renderProfileExtras();if(demo)return;const rawState=JSON.stringify(currentState);if(rawState===lastSaved)return;try{localStorage.setItem('chuoi_draft_'+profile.id,JSON.stringify({state:currentState,revision}))}catch(x){syncProblem('Bộ nhớ thiết bị đầy. Hãy xuất bản nháp và bấm đồng bộ.')}pendingSave=true;clearTimeout(saveTimer);saveTimer=setTimeout(flushSave,900)}});
function syncProblem(s){$('syncWarning').hidden=false;$('syncError').textContent=s;$('connection').textContent='Chưa đồng bộ'}
async function flushSave(){if(demo||!profile||!currentState||saveBlocked||saveBusy)return;if(JSON.stringify(currentState)===lastSaved)return;saveBusy=true;pendingSave=false;const snapshot=JSON.stringify(currentState);$('connection').textContent='Đang đồng bộ…';try{const r=await api('save_state',{data:JSON.parse(snapshot),revision});revision=r.revision;lastSaved=snapshot;lsSet(Date.now(),true);if(JSON.stringify(currentState)===snapshot)localStorage.removeItem('chuoi_draft_'+profile.id);$('connection').textContent='Đã đồng bộ';$('syncWarning').hidden=true}catch(x){syncProblem(errText(x));if(x.message.includes('CONFLICT'))saveBlocked=true}finally{saveBusy=false;if(pendingSave&&!saveBlocked)saveTimer=setTimeout(flushSave,900)}}
$('retrySync').onclick=()=>{if(saveBlocked){toast('Hãy xuất bản nháp rồi tải bản trên máy chủ để tránh ghi đè dữ liệu.');return}flushSave()};
function download(data,name){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('exportDraft').onclick=()=>download({app:'chuoi',version:1,data:currentState},'chuoi-ban-nhap.json');
$('reloadCloud').onclick=wrap(async()=>{if(!confirm('Tải bản trên máy chủ sẽ bỏ thay đổi chưa đồng bộ đang mở. Bạn đã xuất bản nháp cần giữ chưa?'))return;const b=await api('boot');currentState=b.state;revision=b.revision;lastSaved=JSON.stringify(currentState);localStorage.removeItem('chuoi_draft_'+profile.id);lsSet(Date.now());saveBlocked=false;$('syncWarning').hidden=true;mountTracker();toast('Đã tải chuỗi trên máy chủ. Nếu cần, mở file nháp bằng mục Sao lưu trong trang Chuỗi.');});
window.addEventListener('beforeunload',e=>{if(!demo&&currentState&&JSON.stringify(currentState)!==lastSaved){e.preventDefault();e.returnValue=''}});
async function saveProfile(name,avatar){
 if(demo){profile={...profile,name,avatar};localStorage.setItem('chuoi_demo_profile',JSON.stringify(profile))}
 else{const keep={email:profile.email};profile={...(await api('profile',{name,avatar})),...keep}}
 drawProfile();window.MsgAlerts?.sound('success')
}
$('profileForm').onsubmit=wrap(async()=>{const name=$('profileName').value.trim();if(!name)throw new Error('Bạn chưa nhập tên.');await saveProfile(name,profile.avatar);openEdit(false);toast('Đã cập nhật hồ sơ của bạn.')});
$('profileAvatar').onclick=$('changeAvatar').onclick=()=>$('avatarInput').click();
$('avatarInput').onchange=wrap(async()=>{const f=$('avatarInput').files[0];if(!f)return;if(!/^image\/(jpeg|png|webp)$/.test(f.type)||f.size>10*1024*1024)throw new Error('Chọn ảnh JPG, PNG hoặc WebP dưới 10 MB.');const url=URL.createObjectURL(f);try{const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d'),side=Math.min(img.width,img.height);ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,256,256);avatarDraft=canvas.toDataURL('image/jpeg',.8);await saveProfile(profile.name,avatarDraft);toast('Đã đổi ảnh đại diện.')}finally{URL.revokeObjectURL(url);$('avatarInput').value=''}});
async function logout(){if(saveBusy)throw new Error('Đang lưu chuỗi, vui lòng đợi một chút.');if(!demo&&currentState&&JSON.stringify(currentState)!==lastSaved){await flushSave();if(JSON.stringify(currentState)!==lastSaved&&!confirm('Chuỗi chưa đồng bộ. Bản nháp được giữ trên thiết bị này. Vẫn đăng xuất?'))return}window.MsgAlerts?.reset();window.closeGroupChat?.();clearInterval(pollTimer);clearInterval(inboxTimer);chatPlus=null;unreadMap={};updateBadge();clearTimeout(saveTimer);bkInfo={code:'',last:0,loaded:false,err:false};bkPend=null;bkUndoS=null;if(!demo&&session)await raw('/auth/v1/logout',{},await token()).catch(()=>{});storeSession(null);profile=null;currentState=null;selected=null;friends=[];demo=false;$('tracker').srcdoc='';$('app').hidden=true;$('auth').hidden=false;$('authStatus').textContent='Đã đăng xuất.'}
$('logout').onclick=wrap(logout);$('exitDemo').onclick=wrap(logout);
$('copyCode').onclick=wrap(copyCode);
$('findForm').onsubmit=wrap(async()=>{await findFriend($('friendCode').value,false)});
async function loadFriends(){if(demo)return;friends=await api('friends');renderFriends();renderChatList();loadPreviews();if(selected&&!friends.some(f=>f.id===selected.id)){selected=null;$('chatPage').classList.remove('in-thread');$('thread').innerHTML='<div class="empty">Cuộc trò chuyện này không còn khả dụng.</div>'}}
function renderFriends(){if(!friends.length){$('friendsList').innerHTML='<div class="empty"><span>♧</span><h2>Một người bạn là đủ để bắt đầu.</h2><p>Gửi mã của bạn hoặc nhập mã của người bạn muốn đồng hành.</p></div>';return}$('friendsList').innerHTML=friends.map(f=>`<div class="person">${f.status==='accepted'?avatarBadged(f.peer,peerUnread(f.id)):avatarHTML(f.peer)}<div class="details"><b>${esc(f.peer.name)}</b><small>${f.status==='accepted'?'Đã kết bạn':f.incoming?'Muốn đồng hành cùng bạn':'Đã gửi lời mời'}</small></div><div class="actions">${f.status==='accepted'?`<button class="primary" data-chat="${f.id}">${peerUnread(f.id)?'Trả lời':'Nhắn tin'}</button>`:f.incoming?`<button class="primary" data-accept="${f.id}">Chấp nhận</button>`:''}<button class="secondary" data-remove="${f.id}">${f.status==='accepted'?'Hủy kết bạn':f.incoming?'Từ chối':'Hủy lời mời'}</button></div></div>`).join('');bindFriendButtons()}
function bindFriendButtons(){document.querySelectorAll('[data-chat]').forEach(b=>b.onclick=()=>openThread(b.dataset.chat));document.querySelectorAll('[data-accept]').forEach(b=>b.onclick=wrap(async()=>{await api('accept',{id:b.dataset.accept});await loadFriends()}));document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=wrap(async()=>{if(!confirm('Hủy kết nối này? Tin nhắn và chuỗi chung của cặp này sẽ bị xóa.'))return;await api('remove',{id:b.dataset.remove});await loadFriends()}))}
$('refreshFriends').onclick=wrap(loadFriends);
/* ===== Chat kiểu Messenger / Instagram ===== */
let threadMsgs=[],pending=[],tempSeq=0,unseen=0,olderMore=false,threadLoaded=false,sendQ=Promise.resolve(),rendered=new Set(),lastMap={},prevAt=0,cmdForce=false,chatPlus=null,unreadMap={},metaData={reactions:[],pins:[],peer_read:0,my_read:0},metaSig='',reactMap={},readSent={},actionId=null,lastTap={id:null,t:0},pinIdx=0,inboxTimer=null;
const BASE_TITLE=document.title,RX=['❤️','😂','😮','😢','👍','🔥'];
const EMOJIS=['😀','😂','🤣','😊','🥰','😍','😘','😎','🤔','😭','😅','😴','😡','🥳','🤩','😇','👍','👏','🙌','💪','🔥','✨','❤️','💯','🎉','🏆','🙏','🤝','👋','🫶','⭐','🌱','☕','🍀','🚀','🎯','✅','💤','😆','🤗'];
const msgTime=d=>d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});
const sameDay=(p,q)=>p.toDateString()===q.toDateString();
function sepLabel(d){const t=new Date(),y=new Date(Date.now()-864e5);return (sameDay(d,t)?'Hôm nay':sameDay(d,y)?'Hôm qua':d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'}))+' · '+msgTime(d)}
function listTime(iso){const d=new Date(iso),n=new Date(),diff=n-d;if(diff<6e4)return 'Vừa xong';if(sameDay(d,n))return msgTime(d);if(diff<6048e5)return ['CN','T2','T3','T4','T5','T6','T7'][d.getDay()];return d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})}
const onlyEmoji=s=>/\p{Extended_Pictographic}/u.test(s)&&/^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|‍|️|\s){1,14}$/u.test(s);
const seenKey=()=>'chuoi_seen_'+(profile?.id||'');
function getSeen(){try{return JSON.parse(localStorage.getItem(seenKey())||'{}')}catch{return {}}}
function setSeen(fid,mid){try{const s=getSeen();if(!(s[fid]>=mid)){s[fid]=mid;localStorage.setItem(seenKey(),JSON.stringify(s))}}catch{}}
const chatIcon='<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 20.5l1.6-5.3A8.4 8.4 0 1 1 21 11.5z"/></svg>';
const emptyThread='<div class="empty"><span>'+chatIcon+'</span><h2>Chọn một người bạn</h2><p>Nhắn tin, chia sẻ chuỗi và cùng nhau điểm danh.</p></div>';


/* ===== Tính năng nâng cao (cần chat-upgrade.sql): cảm xúc, ghim, đã xem, chưa đọc ===== */
async function chat(action,payload){
 if(demo||chatPlus===false)throw new Error('chat-plus-off');
 try{const r=await raw('/rest/v1/rpc/chuoi_chat',{action,payload},await token());chatPlus=true;return r}
 catch(e){if(/chuoi_chat|schema cache|404|PGRST202/i.test(e.message||'')){chatPlus=false;updateBadge()}throw e}
}
function updateBadge(){
 let n=0;
 if(chatPlus===true)for(const id in unreadMap){if(friends.some(f=>f.id===id&&f.status==='accepted')&&!(activePage==='chat'&&selected?.id===id))n+=unreadMap[id]||0}
 n+=window.MsgAlerts?.groupUnread||0;
 const b=$('chatBadge');b.hidden=!n;b.textContent=n>99?'99+':String(n);
 document.title=(n?'('+n+') ':'')+BASE_TITLE
}
async function pollInbox(){
 if(demo||!profile||chatPlus===false||document.hidden)return;
 try{
  const list=await chat('inbox',{});
  list.forEach(i=>{if(i.last_msg)lastMap[i.id]=i.last_msg;unreadMap[i.id]=i.unread});
  updateBadge();if(activePage==='chat')renderChatList()
 }catch{}
}
async function loadMeta(id){
 if(chatPlus===false||demo)return false;
 try{
  const d=await chat('meta',{id,min_id:Number(threadMsgs[0]?.id||0)});
  if(!selected||selected.id!==id)return false;
  const sig=JSON.stringify(d),ch=sig!==metaSig;metaSig=sig;metaData=d;reactMap={};
  (d.reactions||[]).forEach(r=>{(reactMap[r.m]=reactMap[r.m]||[]).push(r)});
  return ch
 }catch{return false}
}
function markRead(id,lastId){
 if(chatPlus!==true||activePage!=='chat'||document.hidden||!(Number(lastId)>0))return;
 if(readSent[id]>=Number(lastId))return;
 readSent[id]=Number(lastId);unreadMap[id]=0;updateBadge();
 chat('read',{id,upto:Number(lastId)}).catch(()=>{readSent[id]=0})
}
async function softRefresh(){while(threadBusy)await new Promise(r=>setTimeout(r,60));await refreshThread()}
async function react(mid,emoji){
 if(chatPlus!==true||!selected)return;
 const me=profile.id,list=(metaData.reactions||[]).filter(r=>!(String(r.m)===String(mid)&&r.u===me)),mine=(reactMap[mid]||[]).find(r=>r.u===me),e=mine&&mine.e===emoji?'':emoji;
 if(e)list.push({m:Number(mid),u:me,e});
 metaData={...metaData,reactions:list};reactMap={};list.forEach(r=>{(reactMap[r.m]=reactMap[r.m]||[]).push(r)});metaSig='';
 actionId=null;renderMessages(false);
 await chat('react',{id:selected.id,message:Number(mid),emoji:e});await softRefresh()
}
async function pinMsg(mid,on){await chat('pin',{id:selected.id,message:Number(mid),pinned:on});actionId=null;await softRefresh()}
function renderPinBar(){
 const el=$('pinBar');if(!el)return;const ps=metaData.pins||[];
 if(chatPlus!==true||!ps.length){el.hidden=true;return}
 pinIdx=pinIdx%ps.length;const p=ps[pinIdx];el.hidden=false;
 el.innerHTML=`<span class="pin-ic">📌</span><span class="pin-txt"><b>Tin đã ghim${ps.length>1?' ('+(pinIdx+1)+'/'+ps.length+')':''}</b><small>${esc(previewText(p.body))}</small></span>`
}
function jumpPin(){
 const ps=metaData.pins||[];if(!ps.length)return;
 const p=ps[pinIdx%ps.length],row=document.querySelector(`[data-message="${Number(p.m)}"]`);
 if(row){row.scrollIntoView({block:'center',behavior:'smooth'});row.classList.add('flash');setTimeout(()=>row.classList.remove('flash'),1500)}else toast('Tin này nằm ở phần cũ hơn. Bấm “Tải tin nhắn cũ hơn”.');
 pinIdx=(pinIdx+1)%ps.length;renderPinBar()
}

function closeThread(){window.ChatVoice?.cancel();selected=null;cmdForce=false;document.body.classList.remove('thread-open');$('chatPage').classList.remove('in-thread');$('thread').innerHTML=emptyThread;renderChatList()}

function renderChatList(){
 const a=friends.filter(f=>f.status==='accepted');
 if(!a.length){$('chatList').innerHTML='<p class="fine pad">Kết bạn trước để bắt đầu trò chuyện.</p>';return}
 const seen=getSeen(),ts=f=>lastMap[f.id]?new Date(lastMap[f.id].created_at).getTime():0,q=norm($('chatSearch').value).trim();
 a.sort((x,y)=>ts(y)-ts(x));
 const list=q?a.filter(f=>norm(f.peer.name).includes(q)):a;
 if(!list.length){$('chatList').innerHTML='<p class="fine pad">Không tìm thấy cuộc trò chuyện nào.</p>';return}
 $('chatList').innerHTML=list.map(f=>{
  const m=lastMap[f.id],un=unreadMap[f.id]||0,unread=chatPlus===true?(un>0&&selected?.id!==f.id):(!!m&&m.sender!==profile.id&&Number(seen[f.id]||0)<Number(m.id)&&selected?.id!==f.id);
  const sub=m?(m.sender===profile.id?'Bạn: ':'')+esc(previewText(m.body)):'Chạm để nhắn tin';
  return `<button class="chat-row ${selected?.id===f.id?'selected':''} ${unread?'unread':''}" data-thread="${f.id}">${avatarBadged(f.peer,peerUnread(f.id))}<span class="chat-meta"><span class="chat-top"><b>${esc(f.peer.name)}</b>${m?`<time>${esc(listTime(m.created_at))}</time>`:''}</span><span class="chat-sub">${sub}</span></span><i class="dot${chatPlus===true?' num':''}" aria-label="Chưa đọc">${chatPlus===true&&un>0?(un>9?'9+':un):''}</i></button>`
 }).join('');
 document.querySelectorAll('[data-thread]').forEach(b=>b.onclick=()=>openThread(b.dataset.thread))
}
$('chatSearch').oninput=()=>renderChatList();

async function loadPreviews(){
 if(demo||chatPlus===true||activePage!=='chat'||Date.now()-prevAt<14000)return;
 const a=friends.filter(f=>f.status==='accepted').slice(0,12);if(!a.length)return;prevAt=Date.now();
 await Promise.all(a.map(async f=>{if(selected?.id===f.id)return;try{const d=await api('thread',{id:f.id}),m=d.messages[d.messages.length-1];if(m)lastMap[f.id]=m}catch{}}));
 if(!selected||window.innerWidth>700)renderChatList()
}

function updateToBottom(){
 const el=$('messages'),b=$('toBottom');if(!el||!b)return;
 const far=el.scrollHeight-el.scrollTop-el.clientHeight>240;if(!far)unseen=0;
 b.hidden=!far;b.classList.toggle('has-new',!!unseen);b.querySelector('span').textContent=unseen?unseen+' tin mới':'Mới nhất'
}

/* mode: true = cuộn xuống cuối · 'prepend' = giữ vị trí khi tải tin cũ · false = giữ nguyên vị trí */
function renderMessages(mode){
 const el=$('messages');if(!el||!selected)return;
 const anchor=window.ChatView?.capture(el),prevTop=el.scrollTop,keep=el.scrollHeight-el.scrollTop,list=threadMsgs.concat(pending),first0=rendered.size===0,pinSet=new Set((metaData.pins||[]).map(p=>String(p.m)));
 let out=olderMore?'<button id="olderMessages" type="button" class="text-btn older">Tải tin nhắn cũ hơn</button>':'';
 if(!list.length){
  out+=`<div class="empty-chat">${avatarHTML(selected.peer)}<b>${esc(selected.peer.name)}</b><p>Chưa có tin nhắn nào. Gửi lời chào đầu tiên nhé!</p><div class="quick">${['👋 Chào bạn!','💪 Cùng cố gắng nhé','🔥 Giữ chuỗi thôi'].map(t=>`<button type="button" data-quick="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`
 }
 const GAP=15*60000,next=new Set();let prev=null;
 list.forEach((m,i)=>{
  const t=new Date(m.created_at),own=m.sender===profile.id,nx=list[i+1],nt=nx&&new Date(nx.created_at),key=m.temp?m.tid:'m'+m.id;next.add(key);
  if(!prev||t-new Date(prev.created_at)>GAP)out+=`<div class="msg-sep">${esc(sepLabel(t))}</div>`;
  const first=!prev||prev.sender!==m.sender||t-new Date(prev.created_at)>GAP,last=!nx||nx.sender!==m.sender||nt-t>GAP;
  const isNew=!first0&&!rendered.has(key)&&(m.temp||!own);
  const special=window.ChatSocial?.body(m.body,m),card=parseCard(m.body),latest=own&&!m.temp&&i===list.length-1,seenBy=latest&&chatPlus===true&&Number(m.id)<=Number(metaData.peer_read||0),meta=m.failed?'Chưa gửi được · Chạm để thử lại':m.temp?'Đang gửi…':(latest?(seenBy?'Đã xem · ':'Đã gửi · '):'')+msgTime(t);
  const sid=String(m.id),pinned=!m.temp&&pinSet.has(sid),showAct=!m.temp&&!m.failed&&actionId===sid,rxs=m.temp?[]:(reactMap[m.id]||[]);
  let chips='';if(rxs.length){const g={};rxs.forEach(r=>{(g[r.e]=g[r.e]||{n:0,me:false}).n++;if(r.u===profile.id)g[r.e].me=true});chips='<div class="rx">'+Object.entries(g).map(([e,v])=>`<button type="button" class="rx-chip${v.me?' me':''}" data-rx="${esc(e)}" data-mid="${sid}">${esc(e)}${v.n>1?' '+v.n:''}</button>`).join('')+'</div>'}
  const bar=showAct?`<div class="act-bar">${chatPlus===true?RX.map(e=>`<button type="button" class="act-emo" data-pick="${e}" data-mid="${sid}">${e}</button>`).join('')+`<button type="button" class="act-btn" data-act="${pinned?'unpin':'pin'}" data-mid="${sid}">${pinned?'Bỏ ghim':'📌 Ghim'}</button>`:''}<button type="button" class="act-btn" data-act="copy" data-mid="${sid}">Sao chép</button></div>`:'';
  out+=`<div class="msg-row ${own?'own':'peer'}${first?' first':''}${last?' last':''}${m.failed?' failed':''}${latest?' latest':''}${pinned?' pinned':''}${showAct?' show-time':''}${isNew?' new':''}" ${m.temp?`data-tid="${m.tid}"`:`data-message="${m.id}"`}>${own?'':last?avatarHTML(selected.peer):'<span class="avatar ghost"></span>'}<div class="msg-col"><div class="msg${card?' card':onlyEmoji(m.body)?' big':''}${m.temp&&!m.failed?' pending':''}">${special||(card?cardHTML(card):linkify(m.body))}</div>${pinned?'<span class="pin-flag">📌 Đã ghim</span>':''}${chips}${bar}<small class="msg-meta">${esc(meta)}</small></div></div>`;
  prev=m
 });
 rendered=next;if(window.ChatView)window.ChatView.patch(el,out);else el.innerHTML=out;renderPinBar();window.ChatSocial?.hydrate();
 if(window.ChatView)window.ChatView.restore(el,anchor,mode===true);else el.scrollTop=mode===true?el.scrollHeight:mode==='prepend'?el.scrollHeight-keep:prevTop;
 updateToBottom()
}

async function loadOlder(){
 const first=threadMsgs[0];if(!first||!selected)return;
 const id=selected.id,el=$('messages');const d=await api('thread',{id,before:first.id});if(selected?.id!==id||$('messages')!==el)return;
 threadMsgs=d.messages.filter(m=>!threadMsgs.some(x=>x.id===m.id)).concat(threadMsgs);olderMore=d.messages.length>=100;renderMessages('prepend')
}

function sendText(text){
 const t={temp:true,tid:'t'+(++tempSeq),nonce:crypto.randomUUID(),fid:selected.id,sender:profile.id,body:text,created_at:new Date().toISOString()};
 pending.push(t);renderMessages(true);sendQ=sendQ.then(()=>postPending(t))
}
async function postPending(t){
 t.failed=false;
 try{const result=await raw('/rest/v1/rpc/chuoi_send_message',{payload:{id:t.fid,body:t.body,nonce:t.nonce}},await token());t.serverId=result.id;t.sent=true;window.MsgAlerts?.sound('send')}catch(e){t.failed=true;toast(/chuoi_send_message|PGRST202/.test(e.message)?'Cần chạy database/upgrade-20261024.sql trong Supabase để cập nhật chat.':errText(e))}
 if(selected&&selected.id===t.fid)await refreshThread(true).catch(()=>{})
}

function sendShare(){const c=myStats(currentState);sendText(`[[chiase|${c.days}|${c.goal}|${c.best}|${c.fails}]]`)}
const cmdKey=v=>norm(v).replace(/\s+/g,'');
function cmdState(){
 const ta=$('messageInput'),menu=$('cmdMenu');if(!ta||!menu)return;
 const v=cmdKey(ta.value),typing=v.startsWith('/')&&['/chiase','/chiase2'].some(c=>c.startsWith(v)),exact=v==='/chiase',show=typing||cmdForce;
 menu.hidden=!show;$('plusBtn').setAttribute('aria-expanded',String(cmdForce));
 if(show){
  menu.innerHTML=v==='/chiase2'?`<div class="cmd-preview"><small>/chiase2 · XEM TRƯỚC · bấm gửi để chia sẻ</small>${window.ChatSocial?.previewShare()||''}</div>`:exact?`<div class="cmd-preview"><small>/chiase · XEM TRƯỚC · bấm gửi để chia sẻ</small>${cardHTML(myStats(currentState))}</div>`:`<button type="button" class="cmd-item" data-cmd="/chiase"><span class="cmd-ic">${ICON.chart}</span><span><b>/chiase</b><small>Chia sẻ chuỗi hiện tại, kỷ lục và số lần thất bại</small></span></button><button type="button" class="cmd-item" data-cmd="/chiase2"><span class="cmd-ic">🔥</span><span><b>/chiase2</b><small>Chuỗi và kỷ lục chi tiết ngày · giờ · phút</small></span></button>`;
  const m=$('messages');if(m)setTimeout(()=>{m.scrollTop=m.scrollHeight},30)
 }
}
function openInfo(open=true){
 const el=$('convInfo');if(!el)return;
 el.hidden=!open;$('infoBtn').setAttribute('aria-expanded',String(open));
 if(open)renderInfo()
}
function renderInfo(){
 const el=$('convInfo');if(!el||!selected)return;
 const d=threadData||{},p=selected.peer,ps=d.peer_streak,id=selected.id;
 el.innerHTML=`<div class="info-head"><button id="infoBack" class="back" type="button" aria-label="Đóng">‹</button><b>Thông tin</b></div><div class="info-body"><div class="info-who">${avatarHTML(p)}<h2>${esc(p.name)}</h2><small>Mã bạn bè: ${esc(fmtFC(p.code))}</small></div><div class="info-card"><small class="eyebrow">CHUỖI CÁ NHÂN CỦA ${esc(p.name)}</small>${ps?`<div class="info-streak"><b>${ps.days}</b><span>/ ${ps.goal} ngày</span></div>`:'<p class="fine" style="margin:0">Họ chưa bật chia sẻ trực tiếp. Họ vẫn có thể gửi /chiase vào đoạn chat bất cứ lúc nào.</p>'}</div>${chatPlus===true&&(metaData.pins||[]).length?`<div class="info-card"><small class="eyebrow">TIN ĐÃ GHIM</small>${metaData.pins.map(x=>`<div class="pin-row"><span>${esc(previewText(x.body))}</span><button class="text-btn" type="button" data-unpin="${Number(x.m)}">Bỏ ghim</button></div>`).join('')}</div>`:''}<div class="info-card"><label class="sharing-row"><input id="shareToggle" type="checkbox" ${d.sharing?'checked':''}>Cho ${esc(p.name)} xem số ngày chuỗi cá nhân của bạn</label></div><button id="infoShare" class="secondary wide" type="button">Gửi /chiase · chuỗi &amp; thất bại của tôi</button><button id="infoUnfriend" class="text-btn danger wide" type="button">Hủy kết bạn</button></div>`;
 $('infoBack').onclick=()=>openInfo(false);
 document.querySelectorAll('[data-unpin]').forEach(b=>b.onclick=wrap(()=>pinMsg(b.dataset.unpin,false)));
 $('shareToggle').onchange=wrap(async()=>{await api('sharing',{id,enabled:$('shareToggle').checked});await refreshThread()});
 $('infoShare').onclick=()=>{openInfo(false);sendShare()};
 $('infoUnfriend').onclick=wrap(async()=>{if(!confirm('Hủy kết nối này? Tin nhắn của cặp này sẽ bị xóa.'))return;await api('remove',{id});closeThread();await loadFriends()})
}

async function openThread(id){
 window.ChatVoice?.cancel();
 selected=friends.find(f=>f.id===id);if(!selected)return;
 threadMsgs=[];pending=[];unseen=0;olderMore=false;threadLoaded=false;rendered=new Set();cmdForce=false;threadData=null;actionId=null;pinIdx=0;metaData={reactions:[],pins:[],peer_read:0,my_read:0};metaSig='';reactMap={};
 switchPage('chat');renderChatList();$('chatPage').classList.add('in-thread');
 $('thread').innerHTML=`<div class="thread-head"><button id="threadBack" class="back" aria-label="Quay lại danh sách">‹</button>${avatarHTML(selected.peer)}<div class="head-text" id="headText"><h2>${esc(selected.peer.name)}</h2><small id="headSub">Bạn bè</small></div><button id="infoBtn" class="ic-btn head-ic" type="button" aria-label="Thông tin cuộc trò chuyện" aria-expanded="false">${ICON.info}</button></div><div id="pinBar" class="pin-bar" hidden></div><div class="msg-wrap"><div id="messages" class="messages" aria-live="polite"></div><button id="toBottom" type="button" class="to-bottom" hidden>↓ <span></span></button></div><div id="cmdMenu" class="cmd-menu" hidden></div><div id="emojiTray" class="emoji-tray" hidden>${EMOJIS.map(e=>`<button type="button" data-emo="${e}" aria-label="${e}">${e}</button>`).join('')}</div><form id="composer" class="composer"><button type="button" id="plusBtn" class="ic-btn" aria-label="Lệnh nhanh /chiase" aria-expanded="false">${ICON.plus}</button><button type="button" id="emojiBtn" class="ic-btn" aria-label="Biểu tượng cảm xúc" aria-expanded="false">☺</button><textarea id="messageInput" rows="1" maxlength="2000" aria-label="Tin nhắn" placeholder="Nhắn tin hoặc /chiase" autocomplete="off" enterkeyhint="send"></textarea><button id="sendButton" class="send-btn" aria-label="Gửi"><span class="s-like">👍</span><svg class="s-send" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.3 10l12.6 2-12.6 2z"/></svg></button></form><div id="convInfo" class="conv-info" hidden></div>`;
 window.ChatSocial?.mount();window.ChatVoice?.mount();window.ChatCall?.mount();window.ChatView?.mount($('messages'));
 const ta=$('messageInput'),form=$('composer'),msgs=$('messages');
 const fit=()=>{const a=window.ChatView?.capture(msgs);ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,120)+'px';form.classList.toggle('has-text',!!ta.value.trim());window.ChatView?.restore(msgs,a,a?.bottom)};
 $('threadBack').onclick=closeThread;
 $('pinBar').onclick=jumpPin;
 $('infoBtn').onclick=()=>openInfo($('convInfo').hidden);$('headText').onclick=()=>openInfo(true);
 ta.addEventListener('input',()=>{fit();cmdState()});
 ta.addEventListener('focus',()=>{$('emojiTray').hidden=true;$('emojiBtn').setAttribute('aria-expanded','false');window.ChatView?.viewport()});
 ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229&&ta.value.trim()){e.preventDefault();form.requestSubmit()}});
 form.addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault()});
 $('cmdMenu').addEventListener('pointerdown',e=>{if(e.target.closest('button'))e.preventDefault()});
 form.onsubmit=e=>{
  e.preventDefault();const raw=ta.value.trim(),v=cmdKey(raw);
  if(v.startsWith('/')&&v!=='/chiase'&&'/chiase'.startsWith(v)){ta.value='/chiase';fit();cmdState();return}
  ta.value='';fit();cmdForce=false;cmdState();ta.focus({preventScroll:true});
  if(v==='/chiase')sendShare();else if(v==='/chiase2')window.ChatSocial?.sendShare();else sendText(raw||'👍')
 };
 $('plusBtn').onclick=()=>{cmdForce=!cmdForce;$('emojiTray').hidden=true;$('emojiBtn').setAttribute('aria-expanded','false');cmdState()};
 $('cmdMenu').onclick=e=>{const b=e.target.closest('[data-cmd]');if(!b)return;ta.value=b.dataset.cmd;cmdForce=false;fit();cmdState();ta.focus({preventScroll:true})};
 $('emojiBtn').onclick=()=>{const tray=$('emojiTray');cmdForce=false;cmdState();tray.hidden=!tray.hidden;$('emojiBtn').setAttribute('aria-expanded',String(!tray.hidden));if(!tray.hidden)setTimeout(()=>{msgs.scrollTop=msgs.scrollHeight},50)};
 $('emojiTray').onclick=e=>{const b=e.target.closest('[data-emo]');if(!b)return;ta.setRangeText(b.dataset.emo,ta.selectionStart,ta.selectionEnd,'end');fit();ta.focus({preventScroll:true})};
 $('toBottom').onclick=()=>{unseen=0;msgs.scrollTo({top:msgs.scrollHeight,behavior:'smooth'})};
 msgs.addEventListener('scroll',updateToBottom,{passive:true});
 msgs.addEventListener('click',wrap(async e=>{
  if(e.target.closest('#olderMessages'))return loadOlder();
  const q=e.target.closest('[data-quick]');if(q)return sendText(q.dataset.quick);
  if(e.target.closest('a,audio,[data-voice],[data-chat-image],[data-chat-game],[data-highlow-game]'))return;
  const rx=e.target.closest('[data-rx]');if(rx)return react(rx.dataset.mid,rx.dataset.rx);
  const pk=e.target.closest('[data-pick]');if(pk)return react(pk.dataset.mid,pk.dataset.pick);
  const ac=e.target.closest('[data-act]');
  if(ac){const mid=ac.dataset.mid,a=ac.dataset.act;
   if(a==='copy'){const m=threadMsgs.find(x=>String(x.id)===mid);actionId=null;renderMessages(false);if(m){await navigator.clipboard.writeText(m.body);toast('Đã sao chép tin nhắn.')}return}
   return pinMsg(mid,a==='pin')}
  const row=e.target.closest('.msg-row');if(!row||!e.target.closest('.msg'))return;
  if(row.classList.contains('failed')){const t=pending.find(x=>x.tid===row.dataset.tid);if(t){t.failed=false;renderMessages(true);sendQ=sendQ.then(()=>postPending(t))}return}
  const mid=row.dataset.message;
  if(!mid){row.classList.toggle('show-time');return}
  const now=Date.now();
  if(chatPlus===true&&lastTap.id===mid&&now-lastTap.t<320){lastTap={id:null,t:0};return react(mid,'❤️')}
  lastTap={id:mid,t:now};actionId=actionId===mid?null:mid;renderMessages(false)
 }));
 try{await refreshThread(true)}catch(e){toast(errText(e))}
 if(window.innerWidth>700)ta.focus({preventScroll:true})
}

async function refreshThread(force=false){
 if(!selected||demo)return;
 if(threadBusy){if(!force)return;while(threadBusy)await new Promise(r=>setTimeout(r,60));if(!selected)return}
 threadBusy=true;const id=selected.id,threadEl=$('messages');
 try{
  const d=await api('thread',{id});if(!selected||selected.id!==id||$('messages')!==threadEl)return;threadData=d;
  const el=$('messages');if(!el)return;
  const bottom=el.scrollHeight-el.scrollTop-el.clientHeight<80,have=new Set(threadMsgs.map(m=>String(m.id))),fresh=d.messages.filter(m=>!have.has(String(m.id))),before=pending.length;
  if(fresh.length)threadMsgs=threadMsgs.concat(fresh).sort((a,b)=>Number(a.id)-Number(b.id));
  if(!threadLoaded){olderMore=d.messages.length>=100}
  pending=pending.filter(t=>!t.sent||!threadMsgs.some(m=>String(m.id)===String(t.serverId)));for(const t of pending)if(t.sent)t.temp=true;
  const mch=await loadMeta(id);if(!selected||selected.id!==id||$('messages')!==threadEl)return;
  let bodyChanged=false;const refreshed=new Map(d.messages.map(m=>[String(m.id),m]));threadMsgs=threadMsgs.map(m=>{const next=refreshed.get(String(m.id));if(next&&next.body!==m.body){bodyChanged=true;return next}return m});
  const incoming=fresh.filter(m=>m.sender!==profile.id).length,changed=bodyChanged||!threadLoaded||fresh.length||pending.length!==before||mch||pending.some(t=>t.failed),stick=!threadLoaded||el.scrollHeight-el.scrollTop-el.clientHeight<80;
  if(changed){if(!stick&&incoming)unseen+=incoming;if(stick)unseen=0;renderMessages(stick?true:false)}
  threadLoaded=true;
  const last=threadMsgs[threadMsgs.length-1];if(last){lastMap[id]=last;setSeen(id,Number(last.id));if(changed)renderChatList();markRead(id,last.id)}
  const ps=d.peer_streak;
  $('headSub').textContent=ps?`🔥 Đang giữ ${ps.days}/${ps.goal} ngày`:'Bạn bè';
  if($('convInfo')&&!$('convInfo').hidden)renderInfo();
  $('connection').textContent='Đã kết nối'
 }finally{threadBusy=false}
}
const fmtDate=v=>v?new Date(v).toLocaleDateString('vi-VN'):'—';
function lastActive(p){const t=[p.last_sign_in_at,p.synced_at].filter(Boolean).map(x=>new Date(x).getTime());return t.length?Math.max(...t):null}
async function adminCall(extra){return raw('/rest/v1/rpc/chuoi_admin',{payload:{page:adminPage,search:$('adminQuery').value.trim(),sort:$('adminSort').value,...extra}},await token())}
async function loadAdmin(){if(!profile.admin||demo)throw new Error('Bạn không có quyền quản trị.');const data=await adminCall({});if(data.account_filter!=='verified_email_and_signed_in'){$('adminFilterStatus').textContent='Cần chạy database/admin-valid-users.sql trong Supabase để chỉ hiện tài khoản hợp lệ.';$('adminStats').innerHTML='';$('adminUsers').innerHTML='';$('adminNext').disabled=true;$('adminPrev').disabled=true;$('adminExport').disabled=true;return}$('adminExport').disabled=false;$('adminFilterStatus').textContent=data.account_filter==='verified_email_and_signed_in'?'Đang lọc tài khoản hợp lệ · '+data.matched+' kết quả tìm kiếm':'Chưa bật bộ lọc trên máy chủ. Chạy database/admin-valid-users.sql trong Supabase.';const s=data.stats,max=Math.max(1,...s.signups.map(x=>x.n));$('adminStats').innerHTML=`<div class="flex" style="flex-wrap:wrap;gap:14px"><span><b>${s.total}</b><br><small>Tài khoản hợp lệ</small></span><span><b>${s.new_today}</b><br><small>Mới hôm nay</small></span><span><b>${s.new_7d}</b><br><small>Mới 7 ngày</small></span><span><b>${s.active_7d}</b><br><small>Hoạt động 7 ngày</small></span><span><b>${s.with_streak}</b><br><small>Đang có chuỗi</small></span><span><b>${s.disabled}</b><br><small>Tạm khóa</small></span></div><div style="display:flex;align-items:flex-end;gap:3px;height:48px;margin-top:12px" aria-label="Đăng ký mới 14 ngày qua">${s.signups.map(x=>`<i title="${esc(x.day)}: ${x.n}" style="flex:1;background:var(--accent);border-radius:3px;height:${Math.max(4,Math.round(x.n/max*48))}px"></i>`).join('')}</div><small class="muted">Đăng ký mới 14 ngày qua</small>`;$('adminPageNumber').textContent='Trang '+(adminPage+1);$('adminPrev').disabled=adminPage===0;$('adminNext').disabled=typeof data.has_more==='boolean'?!data.has_more:data.users.length<50;$('adminUsers').innerHTML=data.users.length?data.users.map(p=>{const la=lastActive(p);return `<div class="person"><div class="details"><b>${esc(p.name)} ${p.admin?'· Admin':''}</b><small>${esc(p.email||'—')}</small><small>${esc(p.code)} · ${p.disabled?'Tạm khóa':'Đã kích hoạt'} · tạo ${esc(fmtDate(p.created_at))}</small><small>Chuỗi: ${p.streak==null?'chưa có':p.streak+' ngày'} · Bạn bè: ${p.friends} · Hoạt động gần nhất: ${la?esc(new Date(la).toLocaleString('vi-VN')):'—'}</small></div>${!p.admin?`<button class="secondary ${p.disabled?'':'danger'}" data-disable="${p.id}" data-value="${!p.disabled}">${p.disabled?'Mở khóa':'Tạm khóa'}</button>`:''}</div>`}).join(''):'<div class="empty">Không tìm thấy người dùng.</div>';document.querySelectorAll('[data-disable]').forEach(b=>b.onclick=wrap(async()=>{if(!confirm('Xác nhận '+b.textContent.toLowerCase()+' tài khoản này?'))return;await api('admin_disable',{user_id:b.dataset.disable,disabled:b.dataset.value==='true'});await loadAdmin();toast('Đã cập nhật trạng thái tài khoản.')}))}
$('adminExport').onclick=wrap(async()=>{const data=await adminCall({export:true});if(data.account_filter!=='verified_email_and_signed_in')throw new Error('Hãy chạy database/admin-valid-users.sql trước khi xuất tài khoản hợp lệ.');const cell=v=>{v=String(v??'');if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'};const rows=[['Tên','Email','Mã','Admin','Khóa','Ngày tạo','Chuỗi (ngày)','Bạn bè','Hoạt động gần nhất'],...data.users.map(p=>{const la=lastActive(p);return [p.name,p.email,p.code,p.admin?'có':'',p.disabled?'có':'',fmtDate(p.created_at),p.streak??'',p.friends,la?new Date(la).toISOString():'']})];const blob=new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='nguoi-dung-chuoi.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Đã xuất '+data.users.length+' người dùng.'+(data.export_truncated?' Kết quả vượt 2.000 dòng; hãy thu hẹp tìm kiếm để xuất phần còn lại.':''))});
$('adminSearch').onsubmit=wrap(async()=>{adminPage=0;await loadAdmin()});$('adminPrev').onclick=wrap(async()=>{adminPage=Math.max(0,adminPage-1);await loadAdmin()});$('adminNext').onclick=wrap(async()=>{adminPage++;await loadAdmin()});
(async()=>{$('setupNote').hidden=configured;
 try{const lm=localStorage.getItem('chuoi_last_email');if(lm&&!$('email').value)$('email').value=lm;$('rememberMe').checked=remembered()}catch{}
 try{const q=new URLSearchParams(location.search),kb=normFC(q.get('kb')||'');if(kb){sessionStorage.setItem('chuoi_kb',kb);q.delete('kb');history.replaceState(null,'',location.pathname+(q.toString()?'?'+q:'')+location.hash)}}catch{}
 try{const hash=new URLSearchParams(location.hash.slice(1));if(hash.has('access_token')){storeSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_in:Number(hash.get('expires_in'))||3600});const recovery=hash.get('type')==='recovery';history.replaceState(null,'',location.pathname);if(recovery){$('resetDialog').showModal();return}await enter();return}
  const saved=readSession();
  if(saved&&configured){session=saved;try{await enter()}catch(e){const offline=/Failed to fetch|NetworkError|Load failed/i.test(e.message||'');if(offline){$('authStatus').textContent='Không có kết nối mạng. Hãy kiểm tra mạng rồi tải lại trang.';return}storeSession(null);session=null;$('app').hidden=true;$('auth').hidden=false;$('authStatus').textContent='Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.'}}
 }catch(e){$('authStatus').textContent=errText(e);}
})();

document.addEventListener('visibilitychange',()=>{if(!profile)return;if(document.hidden)flushSave();else pollInbox()});
window.addEventListener('pagehide',()=>{if(profile)flushSave()});
