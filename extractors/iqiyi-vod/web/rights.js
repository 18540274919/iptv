// Public directory VIP marks never establish this account's playback rights.
(()=>{
 let rows=new Map();
 function paint(element){
  const row=rows.get(element.dataset.rightsUrl),state=row?.state||'unresolved';
  element.dataset.rightsState=state;
  element.textContent=state==='ready'?'完整播放已核验':state==='denied'?'无完整权限':state==='failed'?'暂时核验失败':state==='expired'?'授权已到期 · 待核验':row?.resolving?'正在核验完整权限':'完整权限待核验';
  element.title=state==='denied'?'仅获试看或当前账号权益不足；不发布清单，不提供分片。':state==='failed'?'暂未取得可验证的完整清单；可能为网络或解析问题，请重试。':state==='ready'?'当前完整播放清单已核验；缓存到期后重新核验。':'点击播放时核验，不会因浏览片单自动解析全部视频。';
 }
 window.playbackRights={badge(url){const element=document.createElement('span');element.className='rights-badge';element.dataset.rightsUrl=url;paint(element);return element}};
 window.addEventListener('playback-rights',event=>{
  rows=new Map(event.detail.map(row=>[row.url,row]));
  for(const element of document.querySelectorAll('[data-rights-url]'))paint(element);
 });
})();
