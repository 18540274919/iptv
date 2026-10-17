import {createHash} from 'node:crypto'
const failure=(message,code='BAD_REQUEST')=>Object.assign(new Error(message),{code})
export function videoIdentity(sample){return 'iqiyi:'+createHash('sha256').update(sample.url).digest('hex').slice(0,24)}
export function danmakuAttribute(id,origin){return ` danmaku-url="${origin}/api/danmaku/v1/videos/${id}"`}
export function createUnifiedDanmaku({runtime,danmaku,samples}){
 async function authorized(id){
  const sample=samples.find(s=>s.id===id);if(!sample)throw failure('未知视频','NOT_FOUND')
  return {sample,value:await runtime.get(id)}
 }
 return {
  async metadata(id){
   const {sample,value}=await authorized(id)
   return {schemaVersion:1,videoID:videoIdentity(sample),title:sample.title,duration:value.duration,available:!!value.danmaku?.videoId,segmentSeconds:60,segmentsURL:`/api/danmaku/v1/videos/${id}/segments`}
  },
  async segment(id,part){
   const {sample,value}=await authorized(id)
   if(!value.danmaku?.videoId)throw failure('此视频暂无可用弹幕','UNSUPPORTED')
   if(!Number.isInteger(part)||part<1||part>Math.ceil(value.duration/60))throw failure('弹幕时间段无效')
   const data=await danmaku.get(value.danmaku.videoId,part)
   // A rights check can finish while the public packet is in flight.
   const current=await runtime.get(id)
   if(current.danmaku?.videoId!==value.danmaku.videoId)throw failure('视频标识已更新，请重新加载','SEGMENT_CHANGED')
   return {schemaVersion:1,videoID:videoIdentity(sample),...data,items:data.items.map(item=>({...item,mode:'scroll'}))}
  }
 }
}
