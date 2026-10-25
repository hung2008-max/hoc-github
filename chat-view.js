/* Retain message/media DOM and the visible reading anchor across updates. */
'use strict';
window.ChatView=(()=>{
 const source=new WeakMap();let active=null,observer=null,frame=0,pinned=true;
 const key=n=>n.nodeType===1?(n.getAttribute('data-message')||n.getAttribute('data-tid')||n.getAttribute('data-chat-key')||n.id||''):'';
 function capture(el){if(!el)return null;const top=el.getBoundingClientRect().top;const row=[...el.children].find(n=>key(n)&&n.getBoundingClientRect().bottom>top);return {key:row&&key(row),offset:row?row.getBoundingClientRect().top-top:0,top:el.scrollTop,bottom:el.scrollHeight-el.scrollTop-el.clientHeight<80}}
 function restore(el,a,bottom=false){if(!el||!a)return;if(bottom)el.scrollTop=el.scrollHeight;else{const row=a.key&&[...el.children].find(n=>key(n)===a.key);el.scrollTop=row?el.scrollTop+row.getBoundingClientRect().top-el.getBoundingClientRect().top-a.offset:a.top}if(el===active)pinned=el.scrollHeight-el.scrollTop-el.clientHeight<80}
 function morph(old,fresh){
  if(old.nodeType!==fresh.nodeType||old.nodeName!==fresh.nodeName){old.replaceWith(fresh);return fresh}
  if(old.nodeType===3){if(old.data!==fresh.data)old.data=fresh.data;return old}
  if(old.nodeType!==1)return old;
  const html=fresh.outerHTML;if(source.get(old)===html)return old;source.set(old,html);
  for(const a of [...old.attributes])if(!fresh.hasAttribute(a.name))old.removeAttribute(a.name);
  for(const a of fresh.attributes)if(old.getAttribute(a.name)!==a.value)old.setAttribute(a.name,a.value);
  reconcile(old,[...fresh.childNodes]);return old;
 }
 function reconcile(parent,wanted){const keyed=new Map([...parent.childNodes].filter(n=>key(n)).map(n=>[key(n),n]));let cursor=parent.firstChild;for(const fresh of wanted){let old=key(fresh)?keyed.get(key(fresh)):cursor&&!key(cursor)?cursor:null;if(old){if(old!==cursor)parent.insertBefore(old,cursor);old=morph(old,fresh)}else{old=fresh;parent.insertBefore(old,cursor);seed(old)}cursor=old.nextSibling}while(cursor){const next=cursor.nextSibling;cursor.remove();cursor=next}}
 function seed(n){if(n.nodeType===1){source.set(n,n.outerHTML);for(const c of n.children)seed(c)}}
 function patch(el,html){const t=document.createElement('template');t.innerHTML=html;reconcile(el,[...t.content.childNodes])}
 function viewport(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;const v=window.visualViewport;if(v&&v.scale!==1)return;const a=capture(active),stick=pinned;document.documentElement.style.setProperty('--chat-height',(v?.height||innerHeight)+'px');document.documentElement.style.setProperty('--chat-top',(v?.offsetTop||0)+'px');restore(active,a,stick)})}
 function mount(el){observer?.disconnect();active=el;if(!el)return;pinned=true;el.addEventListener('scroll',()=>{pinned=el.scrollHeight-el.scrollTop-el.clientHeight<80},{passive:true});if(window.ResizeObserver){observer=new ResizeObserver(()=>{if(el.isConnected&&pinned)el.scrollTop=el.scrollHeight});observer.observe(el)}viewport()}
 window.visualViewport?.addEventListener('resize',viewport);window.visualViewport?.addEventListener('scroll',viewport);window.addEventListener('resize',viewport);viewport();
 return {patch,capture,restore,mount,viewport};
})();
