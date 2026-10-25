/* Cuộc gọi NHÓM thoại / video (WebRTC dạng lưới) — module tách riêng, phát triển từ call 1-1.
   - Tín hiệu kết nối (SDP/ICE) đi qua RPC riêng public.chuoi_groupcall; media đi thẳng giữa các thiết bị.
   - Không sửa call.js / groups.js: nút gọi gắn vào đầu thread nhóm qua MutationObserver,
     id nhóm đang mở tra qua window.isGroupChatOpen + danh sách nhóm của chính module.
   - Dạng lưới hợp nhóm nhỏ (tới ~6 người). Người vào sau chủ động offer tới người đã ở trong. */
'use strict';
window.GroupCall = (() => {
  const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const I = {
    phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
    video: svg('<rect x="2" y="6" width="13" height="12" rx="3"/><path d="m15 10 6-3v10l-6-3"/>'),
    mic: svg('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>'),
    micOff: svg('<path d="m3 3 18 18M9 9v2a3 3 0 0 0 5 2.2M15 9V5a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11 5.7M19 11a7 7 0 0 1-.6 2.8M12 18v4"/>'),
    camOff: svg('<path d="m3 3 18 18M15 15v1a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3h1M10 6h3a2 2 0 0 1 2 2v3l6-4v10"/>'),
    end: svg('<path d="M3 14c5-4 13-4 18 0l-1.5 3-4-1.2v-2.6a12 12 0 0 0-7 0v2.6L4.5 17z"/>'),
    min: svg('<path d="M6 10l6 6 6-6"/>')
  };
  const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const iceServers = () => { const c = window.CHUOI_CONFIG; return Array.isArray(c?.iceServers) && c.iceServers.length ? c.iceServers : STUN; };
  const supported = () => !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia && window.RTCPeerConnection);
  const label = k => k === 'video' ? 'video' : 'thoại';
  let lastToken = '';
  async function rpc(action, payload) {
    try { const t = await token(); lastToken = t; return await raw('/rest/v1/rpc/chuoi_groupcall', { action, payload }, t); }
    catch (e) { if (/chuoi_groupcall|PGRST202/.test(e.message)) throw Error('Cần chạy database/groupcall-upgrade.sql trong Supabase để bật cuộc gọi nhóm.'); throw e; }
  }
  function mediaError(e) {
    if (e && e.name === 'NotAllowedError') return 'Chưa được phép dùng micro/camera. Hãy bật quyền cho trang rồi thử lại.';
    if (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) return 'Không tìm thấy micro hoặc camera trên thiết bị.';
    if (e && e.name === 'NotReadableError') return 'Micro/camera đang được ứng dụng khác sử dụng.';
    return errText(e);
  }
  function getMedia(video) {
    const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    return navigator.mediaDevices.getUserMedia({ audio, video: video ? { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } } : false });
  }

  /* ---------- chuông ---------- */
  let toneCtx = null, toneT = 0, vibT = 0;
  function beep(freq, ms, gain = .07) {
    try {
      toneCtx = toneCtx || new (window.AudioContext || window.webkitAudioContext)(); if (toneCtx.state === 'suspended') toneCtx.resume().catch(() => {});
      const o = toneCtx.createOscillator(), g = toneCtx.createGain(), t = toneCtx.currentTime;
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .03); g.gain.setValueAtTime(gain, t + ms / 1000 - .05); g.gain.linearRampToValueAtTime(0, t + ms / 1000);
      o.connect(g).connect(toneCtx.destination); o.start(t); o.stop(t + ms / 1000 + .02);
    } catch {}
  }
  function startTone() { stopTone(); const p = () => { beep(880, 320); setTimeout(() => beep(660, 320), 400); try { navigator.vibrate?.([180, 120, 180]) } catch {} }; p(); toneT = setInterval(p, 2400); }
  function stopTone() { clearInterval(toneT); toneT = 0; clearInterval(vibT); vibT = 0; try { navigator.vibrate?.(0) } catch {} }

  /* ---------- khung giao diện ---------- */
  const dialog = document.createElement('dialog');
  dialog.id = 'gcallDialog'; dialog.className = 'gcall-dialog'; dialog.setAttribute('aria-label', 'Cuộc gọi nhóm');
  dialog.innerHTML = '<div class="gcall-top"><button type="button" id="gcMin" class="gcall-min" aria-label="Thu nhỏ cuộc gọi" title="Thu nhỏ — vừa gọi vừa nhắn tin">' + I.min + '</button><h2 id="gcTitle"></h2><p id="gcStatus" role="status"></p></div><div id="gcGrid" class="gcall-grid"></div><div id="gcControls" class="gcall-controls"></div>';
  document.body.append(dialog);
  dialog.addEventListener('cancel', e => e.preventDefault());
  const el = id => dialog.querySelector('#' + id);
  const pill = document.createElement('div');
  pill.id = 'gcallPill'; pill.className = 'gcall-pill'; pill.hidden = true;
  pill.setAttribute('role', 'button'); pill.setAttribute('aria-label', 'Mở lại cuộc gọi nhóm');
  pill.innerHTML = '<span class="gcall-pill-dot"></span><span class="gcall-pill-text"><b id="gcpName"></b><small id="gcpTime">00:00</small></span><button type="button" id="gcpMic" class="gcall-pill-btn" aria-label="Bật/tắt micro">' + I.mic + '</button><button type="button" id="gcpEnd" class="gcall-pill-btn danger" aria-label="Kết thúc cuộc gọi">' + I.end + '</button>';
  document.body.append(pill);
  pill.addEventListener('click', e => { if (e.target.closest('button')) return; maximize(); });
  el('gcMin').onclick = () => minimize();
  pill.querySelector('#gcpMic').onclick = () => toggleMic();
  pill.querySelector('#gcpEnd').onclick = () => leaveCall(true);
  const grid = () => el('gcGrid');
  const memberName = m => m?.name || 'Thành viên';
  const avatarOf = m => (typeof avatarHTML === 'function' && m) ? avatarHTML(m) : '<span class="avatar"></span>';

  /* ---------- trạng thái ---------- */
  const handled = new Set();
  let cur = null;   // phiên gọi đang tham gia
  let ring = null;  // lời mời đang đổ chuông
  let openGroupId = null, groupsCache = { at: 0, list: [] };

  function setStatus(t) { const s = el('gcStatus'); if (s) s.textContent = t || ''; }
  function openDialog(mode) { dialog.dataset.mode = mode; dialog.classList.toggle('is-video', (mode === 'ring' ? ring?.kind : cur?.kind) === 'video'); if (!dialog.open) dialog.showModal(); }

  /* ---------- ô video ---------- */
  function tileFor(uid, m, isLocal = false) {
    let t = grid().querySelector(`[data-uid="${uid}"]`);
    if (t) return t;
    t = document.createElement('div'); t.className = 'gcall-tile' + (isLocal ? ' is-local' : ''); t.dataset.uid = uid;
    t.innerHTML = `<span class="gcall-ava">${avatarOf(m)}</span><video autoplay playsinline ${isLocal ? 'muted' : ''}></video><span class="gcall-tname">${esc(memberName(m))}${isLocal ? ' (bạn)' : ''}</span><span class="gcall-tstate">đang kết nối…</span>`;
    grid().append(t); return t;
  }
  function tileState(uid, txt) { const t = grid().querySelector(`[data-uid="${uid}"]`); if (!t) return; const s = t.querySelector('.gcall-tstate'); if (s) s.textContent = txt || ''; t.classList.toggle('is-live', !txt); }
  function dropTile(uid) { grid().querySelector(`[data-uid="${uid}"]`)?.remove(); }

  /* ---------- kết nối từng cặp (mesh) ---------- */
  function ensurePeer(uid, initiator) {
    let p = cur.peers.get(uid); if (p) return p;
    const pc = new RTCPeerConnection({ iceServers: iceServers() });
    p = { pc, uid, iceBuf: [], makingOffer: false, epoch: 0, watch: 0, stream: null };
    cur.peers.set(uid, p);
    cur.local.getTracks().forEach(tr => pc.addTrack(tr, cur.local));
    pc.ontrack = e => {
      const stream = e.streams[0]; if (!stream || !cur) return;
      p.stream = stream;
      const t = tileFor(uid, cur.roster.get(uid)); const v = t.querySelector('video');
      if (v) {
        v.srcObject = stream; v.play?.().catch(() => {});
        v.onloadeddata = () => { if (cur?.peers.get(uid) === p) { clearTimeout(p.watch); tileState(uid, ''); } };
      }
      if (cur.kind === 'video' && stream.getVideoTracks().length === 0) { tileState(uid, 'chỉ có tiếng'); return; }
      tileState(uid, '');
      clearTimeout(p.watch);
      p.watch = setTimeout(() => { if (cur?.peers.get(uid) === p && v && v.videoWidth === 0) tileState(uid, 'không nhận được hình'); }, 6000);
    };
    pc.onicecandidate = e => { if (e.candidate) rpc('signal', { id: cur.id, to: uid, kind: 'ice', payload: { candidate: e.candidate.toJSON() } }).catch(() => {}); };
    pc.onconnectionstatechange = () => {
      if (!cur) return;
      if (pc.connectionState === 'failed') { tileState(uid, 'không kết nối được'); try { pc.restartIce?.() } catch {} if (initiator) offerTo(uid); }
      else if (pc.connectionState === 'disconnected') tileState(uid, 'mất kết nối…');
      else if (pc.connectionState === 'connected') {
        const v = grid().querySelector(`[data-uid="${uid}"] video`);
        if (cur.kind !== 'video' || (v && v.videoWidth > 0)) tileState(uid, '');
      }
    };
    if (initiator) offerTo(uid);
    return p;
  }
  async function offerTo(uid) {
    const p = cur?.peers.get(uid); if (!p) return;
    try {
      p.makingOffer = true;
      const o = await p.pc.createOffer(); await p.pc.setLocalDescription(o);
      await rpc('signal', { id: cur.id, to: uid, kind: 'offer', payload: { type: 'offer', sdp: p.pc.localDescription.sdp } });
    } catch {} finally { if (cur?.peers.get(uid) === p) p.makingOffer = false; }
  }
  function flushIce(p) { const buf = p.iceBuf.splice(0); for (const c of buf) p.pc.addIceCandidate(c).catch(() => {}); }
  async function handleSignal(s) {
    if (!cur || s.sender === profile.id) return;
    const p = ensurePeer(s.sender, false);
    if (s.kind === 'offer') {
      const collision = p.makingOffer || p.pc.signalingState !== 'stable';
      if (collision) {
        if (String(profile.id) < String(s.sender)) { try { await p.pc.setLocalDescription({ type: 'rollback' }) } catch {} }
        else return;
      }
      await p.pc.setRemoteDescription({ type: 'offer', sdp: s.payload.sdp }); flushIce(p);
      const a = await p.pc.createAnswer(); await p.pc.setLocalDescription(a);
      await rpc('signal', { id: cur.id, to: s.sender, kind: 'answer', payload: { type: 'answer', sdp: p.pc.localDescription.sdp } });
    } else if (s.kind === 'answer') {
      if (p.pc.signalingState !== 'stable') { await p.pc.setRemoteDescription({ type: 'answer', sdp: s.payload.sdp }); flushIce(p); }
    } else if (s.kind === 'ice') {
      if (p.pc.remoteDescription) await p.pc.addIceCandidate(s.payload.candidate).catch(() => {});
      else p.iceBuf.push(s.payload.candidate);
    }
  }
  function closePeer(uid) { const p = cur?.peers.get(uid); if (!p) return; clearTimeout(p.watch); try { p.pc.close() } catch {} cur.peers.delete(uid); dropTile(uid); }

  /* ---------- vòng đời phiên gọi ---------- */
  function rosterMap(view) { return new Map((view.members || []).map(m => [m.user_id, m])); }
  function reconcile(view) {
    cur.roster = rosterMap(view); cur.status = view.status;
    if (view.started_at) cur.startedAt = Date.parse(view.started_at);
    let joinedCount = 0;
    for (const m of view.members || []) {
      if (m.user_id === profile.id) continue;
      if (m.state === 'joined') {
        joinedCount++;
        const t = tileFor(m.user_id, m);
        const p = cur.peers.get(m.user_id);
        const epoch = m.joined_at ? Date.parse(m.joined_at) : 0;
        if (p && epoch && p.epoch && epoch !== p.epoch) { closePeer(m.user_id); }
        else if (p) p.epoch = epoch || p.epoch;
        if (!cur.peers.get(m.user_id)) tileState(m.user_id, 'đang kết nối…');
      } else if (cur.peers.has(m.user_id)) closePeer(m.user_id);
      else dropTile(m.user_id);
    }
    for (const uid of [...cur.peers.keys()]) if (!cur.roster.has(uid)) closePeer(uid);
    el('gcTitle').textContent = view.group_name || 'Cuộc gọi nhóm';
    if (!cur.startedAt) setStatus(joinedCount ? 'Đang chờ thêm người vào…' : 'Đang chờ mọi người vào…');
  }
  async function pollOnce() {
    if (!cur || cur.polling) return;
    cur.polling = true;
    try {
      const view = await rpc('poll', { id: cur.id, after: cur.cursor });
      if (!cur) return;
      for (const s of view.signals || []) { cur.cursor = Math.max(cur.cursor, Number(s.id) || 0); await handleSignal(s).catch(() => {}); }
      if (!cur) return;
      reconcile(view);
      if (view.status === 'ended') teardown('Cuộc gọi đã kết thúc.');
    } catch {} finally { if (cur) cur.polling = false; }
  }
  function beginSession(view, stream) {
    stopTone(); ring = null;
    cur = { id: view.id, groupId: view.group_id, kind: view.kind, host: view.host, local: stream, peers: new Map(), roster: rosterMap(view), cursor: 0, startedAt: view.started_at ? Date.parse(view.started_at) : 0, pollT: 0, tickT: 0, micOn: true, camOn: true, minimized: false };
    pill.hidden = true;
    grid().innerHTML = '';
    const meTile = tileFor(profile.id, { name: profile.name, avatar: profile.avatar }, true);
    const lv = meTile.querySelector('video'); if (lv) { lv.srcObject = stream; lv.play?.().catch(() => {}); }
    tileState(profile.id, view.kind === 'video' ? '' : 'chỉ có tiếng');
    el('gcTitle').textContent = view.group_name || 'Cuộc gọi nhóm';
    renderControls();
    openDialog('call');
    reconcile(view);
    // Người vào sau chủ động kết nối tới mọi người đã ở trong.
    for (const m of view.members || []) if (m.user_id !== profile.id && m.state === 'joined') ensurePeer(m.user_id, true);
    cur.pollT = setInterval(pollOnce, 1200); pollOnce();
    cur.tickT = setInterval(() => {
      if (!cur?.startedAt) return;
      const s = Math.max(0, Math.floor((Date.now() - cur.startedAt) / 1000));
      const mmss = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
      setStatus(mmss + ' · ' + [...cur.roster.values()].filter(m => m.state === 'joined').length + ' người');
      if (cur.minimized) { const t = $('gcpTime'); if (t) t.textContent = mmss; }
    }, 1000);
  }
  function renderControls() {
    const c = el('gcControls'); if (!c || !cur) return;
    const isHost = cur.host === profile.id;
    c.innerHTML = `
      <button type="button" id="gcMic" class="call-btn" aria-label="Bật/tắt micro">${I.mic}</button>
      ${cur.kind === 'video' ? `<button type="button" id="gcCam" class="call-btn" aria-label="Bật/tắt camera">${I.video}</button>` : ''}
      <button type="button" id="gcLeave" class="call-btn danger" aria-label="${isHost ? 'Kết thúc cho cả nhóm' : 'Rời cuộc gọi'}">${I.end}<small>${isHost ? 'Kết thúc' : 'Rời đi'}</small></button>`;
    $('gcMic').onclick = () => toggleMic();
    const cam = $('gcCam'); if (cam) cam.onclick = () => { cur.camOn = !cur.camOn; cur.local.getVideoTracks().forEach(t => t.enabled = cur.camOn); cam.classList.toggle('off', !cur.camOn); tileState(profile.id, cur.camOn ? '' : 'đã tắt camera'); };
    $('gcLeave').onclick = () => leaveCall(true);
  }
  function toggleMic() {
    if (!cur) return;
    cur.micOn = !cur.micOn; cur.local.getAudioTracks().forEach(t => t.enabled = cur.micOn);
    const icon = cur.micOn ? I.mic : I.micOff;
    const big = $('gcMic'); if (big) { big.innerHTML = icon; big.classList.toggle('off', !cur.micOn); }
    const small = $('gcpMic'); if (small) { small.innerHTML = icon; small.classList.toggle('off', !cur.micOn); }
  }
  function minimize() {
    if (!cur || dialog.dataset.mode !== 'call') return;
    cur.minimized = true;
    if (dialog.open) dialog.close();
    $('gcpName').textContent = el('gcTitle').textContent || 'Cuộc gọi nhóm';
    $('gcpEnd').setAttribute('aria-label', cur.host === profile.id ? 'Kết thúc cho cả nhóm' : 'Rời cuộc gọi');
    pill.hidden = false;
  }
  function maximize() {
    if (!cur) return;
    cur.minimized = false; pill.hidden = true;
    openDialog('call');
    grid().querySelectorAll('video').forEach(v => { if (v.srcObject) v.play?.().catch(() => {}); });
  }
  async function leaveCall(manual) {
    if (!cur) return;
    const id = cur.id, isHost = cur.host === profile.id;
    teardown('');
    try { await rpc(isHost ? 'end' : 'leave', { id }); } catch {}
    if (manual) toast(isHost ? 'Đã kết thúc cuộc gọi nhóm.' : 'Đã rời cuộc gọi nhóm.');
  }
  function teardown(msg) {
    if (!cur) { if (dialog.open && dialog.dataset.mode === 'call') dialog.close(); return; }
    clearInterval(cur.pollT); clearInterval(cur.tickT);
    for (const uid of [...cur.peers.keys()]) { try { cur.peers.get(uid).pc.close() } catch {} }
    cur.local?.getTracks().forEach(t => t.stop());
    handled.add(cur.id); cur = null; stopTone();
    pill.hidden = true;
    if (dialog.open) dialog.close();
    if (msg) toast(msg);
  }

  /* ---------- bắt đầu / tham gia ---------- */
  async function start(kind) {
    if (demo) return toast('Đăng nhập tài khoản thật để gọi nhóm.');
    if (cur) return toast('Bạn đang trong một cuộc gọi nhóm.');
    if (!supported()) return toast('Trình duyệt chưa hỗ trợ cuộc gọi (cần HTTPS + micro/camera).');
    const gid = openGroupId || await resolveOpenGroup();
    if (!gid) return toast('Hãy mở một nhóm trước.');
    let stream;
    try { stream = await getMedia(kind === 'video'); } catch (e) { return toast(mediaError(e)); }
    try {
      const view = await rpc('start', { group: gid, kind });
      if (view.existing) { const joined = await rpc('join', { id: view.id }); beginSession(joined, stream); }
      else beginSession(view, stream);
    } catch (e) { stream.getTracks().forEach(t => t.stop()); toast(errText(e)); }
  }
  async function join(view) {
    if (cur) return;
    let stream;
    try { stream = await getMedia(view.kind === 'video'); } catch (e) { return toast(mediaError(e)); }
    try {
      const joined = await rpc('join', { id: view.id });
      beginSession(joined, stream);
    } catch (e) { stream.getTracks().forEach(t => t.stop()); toast(errText(e)); }
  }

  /* ---------- đổ chuông cuộc gọi đến ---------- */
  let lastNoticeTag = '';
  function notifyRing(view) {
    if (!document.hidden) return;
    lastNoticeTag = 'hung-gcall-' + view.id;
    window.MsgAlerts?.notifyNative?.(`${view.host_name || 'Ai đó'} đang gọi ${label(view.kind)} nhóm`, { body: `Nhóm ${view.group_name || ''} — chạm để mở`, tag: lastNoticeTag, requireInteraction: true, renotify: true, data: { kind: 'group', id: view.group_id, uid: profile.id } });
  }
  function clearRingNotice() {
    if (!lastNoticeTag) return; const tag = lastNoticeTag; lastNoticeTag = '';
    navigator.serviceWorker?.getRegistration?.().then(r => r?.getNotifications?.({ tag }).then(list => list.forEach(n => n.close()))).catch(() => {});
  }
  function showRing(view) {
    ring = view; clearRingNotice();
    grid().innerHTML = '';
    const t = document.createElement('div'); t.className = 'gcall-tile is-ring';
    t.innerHTML = `<span class="gcall-ava">${avatarOf({ name: view.group_name, avatar: view.group_avatar })}</span><span class="gcall-tname">${esc(view.group_name || 'Nhóm')}</span><span class="gcall-tstate">${esc(view.host_name || '')} đang gọi ${label(view.kind)} nhóm…</span>`;
    grid().append(t);
    el('gcTitle').textContent = view.group_name || 'Cuộc gọi nhóm';
    setStatus(`Cuộc gọi ${label(view.kind)} nhóm đến…`);
    el('gcControls').innerHTML = `<button type="button" id="gcDecline" class="call-btn danger">${I.end}<small>Từ chối</small></button><button type="button" id="gcAccept" class="call-btn accept">${view.kind === 'video' ? I.video : I.phone}<small>Tham gia</small></button>`;
    openDialog('ring');
    startTone(); notifyRing(view);
    $('gcDecline').onclick = async () => { handled.add(view.id); const id = view.id; dismissRing(); try { await rpc('decline', { id }); } catch {} };
    $('gcAccept').onclick = () => { const v = ring; dismissRing(); if (v) join(v); };
  }
  function dismissRing() { stopTone(); clearRingNotice(); ring = null; if (dialog.open && dialog.dataset.mode === 'ring') dialog.close(); }
  let incomingBusy = false;
  async function checkIncoming() {
    if (incomingBusy || demo || !profile || cur) return;
    if (document.querySelector('#callDialog[open]')) return; // đang gọi 1-1
    incomingBusy = true;
    try {
      const r = await rpc('incoming', {});
      const c = r?.call;
      if (c && !handled.has(c.id)) { if (!ring || ring.id !== c.id) showRing(c); }
      else if (!c && ring) dismissRing();
    } catch {} finally { incomingBusy = false; }
  }
  setInterval(checkIncoming, 2500);

  /* ---------- nút trên đầu thread nhóm + banner "đang gọi" ---------- */
  async function myGroups() {
    if (Date.now() - groupsCache.at < 30000) return groupsCache.list;
    try { const d = await raw('/rest/v1/rpc/chuoi_groups', { action: 'list', payload: {} }, await token()); const list = Array.isArray(d) ? d : (d?.groups || []); groupsCache = { at: Date.now(), list }; } catch {}
    return groupsCache.list;
  }
  async function resolveOpenGroup() {
    const list = await myGroups();
    for (const g of list) if (window.isGroupChatOpen?.(g.id)) { openGroupId = g.id; return g.id; }
    openGroupId = null; return null;
  }
  let banner = null, currentBusy = false, currentAt = 0;
  function ensureBanner(pane) {
    if (banner && banner.isConnected) return banner;
    banner = document.createElement('div'); banner.id = 'gcallBanner'; banner.className = 'gcall-banner'; banner.hidden = true;
    const head = pane.querySelector('.thread-head'); if (head) head.after(banner); else pane.prepend(banner);
    return banner;
  }
  async function refreshBanner() {
    const pane = document.querySelector('#groupThread');
    if (!pane || pane.hidden || cur) { if (banner) banner.hidden = true; return; }
    if (!openGroupId) await resolveOpenGroup();
    if (!openGroupId || currentBusy || Date.now() - currentAt < 3500) return;
    currentBusy = true; currentAt = Date.now();
    try {
      const r = await rpc('current', { group: openGroupId });
      const c = r?.call, b = ensureBanner(pane);
      if (!c) { b.hidden = true; return; }
      const n = (c.members || []).filter(m => m.state === 'joined').length;
      const mine = (c.members || []).find(m => m.user_id === profile.id);
      if (mine?.state === 'joined') { b.hidden = true; return; }
      b.innerHTML = `<span>📞 Cuộc gọi ${label(c.kind)} nhóm đang diễn ra · ${n} người trong cuộc gọi</span><button type="button" class="primary" id="gcallJoinBtn">Tham gia</button>`;
      b.hidden = false;
      b.querySelector('#gcallJoinBtn').onclick = () => join(c);
    } catch {} finally { currentBusy = false; }
  }
  setInterval(refreshBanner, 4000);
  function mountButtons() {
    const info = document.querySelector('#gInfo');
    if (!info || document.querySelector('#gcallAudioBtn')) return;
    const a = document.createElement('button'), v = document.createElement('button');
    a.type = v.type = 'button'; a.id = 'gcallAudioBtn'; v.id = 'gcallVideoBtn'; a.className = v.className = 'ic-btn head-ic gcall-start';
    a.setAttribute('aria-label', 'Gọi thoại nhóm'); v.setAttribute('aria-label', 'Gọi video nhóm'); a.title = 'Gọi thoại nhóm'; v.title = 'Gọi video nhóm';
    a.innerHTML = I.phone; v.innerHTML = I.video;
    a.onclick = () => start('audio'); v.onclick = () => start('video');
    info.before(a, v);
    resolveOpenGroup();
  }
  new MutationObserver(() => mountButtons()).observe(document.body, { childList: true, subtree: true });

  /* ---------- rời trang giữa cuộc gọi ---------- */
  window.addEventListener('pagehide', () => {
    if (!cur || !lastToken) return;
    try {
      const cfg = window.CHUOI_CONFIG;
      fetch(cfg.url.replace(/\/$/, '') + '/rest/v1/rpc/chuoi_groupcall', { method: 'POST', keepalive: true, headers: { apikey: cfg.key, 'Content-Type': 'application/json', Authorization: 'Bearer ' + lastToken }, body: JSON.stringify({ action: cur.host === profile.id ? 'end' : 'leave', payload: { id: cur.id } }) }).catch(() => {});
    } catch {}
  });

  return { start, join, _state: () => ({ cur: !!cur, ring: !!ring }) };
})();
