/* Pure event selection: ignore first snapshot, own messages (filtered by RPC), read
   messages, stale responses and historical messages in newly discovered chats. */
(function(root){
 function selectEvents(rows,seen,first,started){
  const next={...seen},events=[];
  for(const row of rows){
   const key=row.kind+':'+row.id,m=row.latest;if(!m?.id)continue;
   const id=String(m.id),old=seen[key];
   if(old&&BigInt(id)<=BigInt(old))continue;
   next[key]=id;
   if(!first&&Number(row.unread)>0&&(old||Date.parse(m.created_at)>=started-300000))events.push(row);
  }
  return {next,events};
 }
 root.HungNotificationCore={selectEvents};
 if(typeof module==='object')module.exports=root.HungNotificationCore;
})(typeof window==='object'?window:globalThis);
