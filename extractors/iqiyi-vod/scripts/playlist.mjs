import {danmakuAttribute} from './unified-danmaku.mjs'
export async function authorizedPlaylist(runtime,samples,origin){
 const verified=[]
 for(const sample of samples){
  try{await runtime.get(sample.id);verified.push(sample)}catch{}
 }
 // Earlier samples can expire or be revoked while a later sample resolves.
 const ready=new Set(runtime.status().filter(s=>s.state==='ready').map(s=>s.id))
 const published=verified.filter(s=>ready.has(s.id))
 if(!published.length)throw Object.assign(new Error('当前没有已确认完整观看权限的样本，未发布清单'),{code:'UNAVAILABLE'})
 return '#EXTM3U\n'+published.map(s=>`#EXTINF:-1 group-title="爱奇艺点播测试"${danmakuAttribute(s.id,origin)},${s.title.replace(/[\r\n]/g,' ')}\n${origin}/play/${s.id}.m3u8`).join('\n')+'\n'
}
