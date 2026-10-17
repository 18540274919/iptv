// Exact official VOD pages only. Sports live rooms use a separate protocol.
export function videoPage(value){
 try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)return null
  if(u.hostname==='www.iqiyi.com'&&/^\/v_[a-zA-Z0-9]+\.html$/.test(u.pathname))return u.href
  if(u.hostname==='sports.iqiyi.com'&&/^\/resource\/pcw\/play\/[a-zA-Z0-9]+$/.test(u.pathname))return u.href
 }catch{}
 return null
}
