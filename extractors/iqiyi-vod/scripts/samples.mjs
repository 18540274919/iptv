import {videoPage} from './video-page.mjs'
import {createHash} from 'node:crypto'
// Fixed official samples; expected full lengths were checked against official pages.
export const samples = [
  { id:'movie', title:'唐人街探案', category:'电影', url:'https://www.iqiyi.com/v_19rrl9vhkw.html', expectedSeconds:8146 },
  { id:'drama', title:'家有儿女初长成 · 第1集', category:'电视剧', url:'https://www.iqiyi.com/v_19rr0nztrg.html', expectedSeconds:1501 },
]

const fixedIds=new Set(['movie','drama'])
export function registerCatalogSample(item){
 const duration=Number(item.episodeSeconds)
 return registerSample({...item,id:'catalog-'+createHash('sha256').update(item.url).digest('hex').slice(0,16),duration,supported:true},'catalog')
}
export function registerHistorySample(item){return registerSample(item,'history')}
function registerSample(item,kind){
 if(!item.supported||!(kind==='catalog'?/^catalog-[a-f0-9]{16}$/:/^history-[a-f0-9]{16}$/).test(item.id)||!videoPage(item.url)||!Number.isFinite(item.duration)||item.duration<10||item.duration>86400)throw Object.assign(new Error('此入口缺少可信正片地址或完整时长，暂不支持本地播放'),{code:'UNSUPPORTED'})
 const index=samples.findIndex(s=>s.url===item.url)
 // Most recently registered last: when the index is full, the least recently seen title goes.
 if(index>=0){const [existing]=samples.splice(index,1);samples.push(existing);return existing}
 if(samples.length>=1000)samples.splice(samples.findIndex(s=>!fixedIds.has(s.id)),1)
 const sample={id:item.id,title:item.title,category:kind==='history'?'历史':item.category,url:item.url,expectedSeconds:item.duration};samples.push(sample);return sample
}
export function probeSamples(){
 if(!process.env.IQIYI_DESCRIPTOR)return samples
 const item=JSON.parse(process.env.IQIYI_DESCRIPTOR)
 if(!/^(history|catalog)-[a-f0-9]{16}$/.test(item.id)||!videoPage(item.url)||!Number.isFinite(item.expectedSeconds)||item.expectedSeconds<10||item.expectedSeconds>86400)throw new Error('Invalid video descriptor')
 return [item]
}
