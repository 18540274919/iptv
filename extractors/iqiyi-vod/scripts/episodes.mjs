import { browserJob } from '../jobs.js'
import { runtimeDir } from '../paths.js'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {officialPage} from './catalog.mjs'
const root=fileURLToPath(new URL('../',import.meta.url)),exec=promisify(execFile)
const fail=(message,code='UNAVAILABLE')=>Object.assign(new Error(message),{code})
export function normalizeEpisodes(body,albumId){
 if(Number(body?.status_code)!==0||String(body.data?.base_data?.qipu_id)!==String(albumId))throw fail('官网剧集目录与当前专辑不匹配')
 const base=body.data.base_data,blocks=body.data.template?.tabs?.flatMap(t=>t.blocks||[])||[]
 const groups=blocks.filter(b=>b.bk_type==='album_episodes').flatMap(b=>b.data?.data||[]).filter(g=>String(g.entity_id)===String(albumId))
 const seen=new Set(),items=[];let expected=0
 for(const group of groups){const videos=group.videos||{};expected=Math.max(expected,Number(videos.feature_count)||0)
  for(const v of Object.values(videos.feature_paged||{}).flat()){
   const url=officialPage(v.page_url),id=String(v.qipu_id||''),order=Number(v.album_order)
   if(Number(v.content_type)!==1||!url||!url.includes('/v_')||!/^\d+$/.test(id)||!Number.isInteger(order)||order<1||seen.has(id))continue
   seen.add(id);items.push({id,order,title:String(v.short_title||v.title||`${base.title} 第${order}集`),subtitle:String(v.subtitle||''),url,membershipMark:v.is_limited_time_free?'官网限免':Number(v.pay_mark)>0?'官网会员 / 付费':'官网免费标记'})
  }
 }
 items.sort((a,b)=>a.order-b.order)
 if(!items.length)throw fail('官网暂未返回可播放的正片剧集目录')
 return {albumId:String(albumId),title:String(base.title||''),items,available:expected,total:Number(base.total_episode)||expected,update:base.update_info?.update_status||'',complete:items.length>=expected,warning:items.length<expected?'官网当前目录未完整返回，仅展示已取得的正片剧集':''}
}
export function nextEpisode(list,id){
 const current=list.items.find(e=>e.id===id);if(!current)throw fail('当前集已不在官网目录，请重新选集','NOT_FOUND')
 const next=list.items.find(e=>e.order===current.order+1)
 return {next:next||null,reason:next?'':list.items.some(e=>e.order>current.order)?'下一集目录暂缺，已停止自动连播':current.order<list.total?'后续正片尚未上线':'已到最后一集'}
}
async function readEpisodeList(item,{signal}={}){
 const jobs=path.join(runtimeDir,'jobs');await mkdir(jobs,{recursive:true,mode:0o700});const job=await mkdtemp(path.join(jobs,'episodes-')),output=path.join(job,'list.json')
 try{
  await browserJob(path.join(root,'scripts/episode-probe.mjs'),{cwd:root,signal,timeout:70000,maxBuffer:262144,env:{...process.env,IQIYI_EPISODE_ITEM:JSON.stringify({url:item.url,albumId:item.albumId}),IQIYI_EPISODE_OUTPUT:output}})
  return JSON.parse(await readFile(output,'utf8'))
 }catch{throw fail('官网选集目录暂未获取，请稍后重试；当前登录态保留')}
 finally{await rm(job,{recursive:true,force:true})}
}
export function createEpisodes({read=readEpisodeList,fetchImpl=fetch,now=Date.now,ttlMs=300000}={}){
 const cache=new Map(),pending=new Map(),controller=new AbortController();let closed=false
 async function get(item){
  if(closed)throw fail('选集服务已停止')
  if(Number(item.channelId)!==2||!/^\d+$/.test(item.albumId||''))throw fail('此条目不是可选集的电视剧','UNSUPPORTED')
  const key=item.albumId,cached=cache.get(key);if(cached&&now()-cached.fetchedAt<ttlMs)return cached
  if(pending.has(key))return pending.get(key)
  const task=(async()=>{const data=await read(item,{signal:controller.signal});if(data.albumId!==key||!Array.isArray(data.items))throw fail('目录专辑标识不匹配');const value={...data,fetchedAt:now()};cache.set(key,value);return value})().finally(()=>pending.delete(key));pending.set(key,task);return task
 }
 async function prepare(item,id){
  const data=await get(item),episode=data.items.find(e=>e.id===id);if(!episode)throw fail('剧集已更新，请重新打开选集','NOT_FOUND')
  const u=new URL('https://mesh.if.iqiyi.com/tvg/play/mixer');u.searchParams.set('id',episode.id);u.searchParams.set('fid','')
  const r=await fetchImpl(u,{headers:{Referer:episode.url,'User-Agent':'Mozilla/5.0'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])})
  if(!r.ok)throw fail('官网剧集时长获取失败')
  const body=await r.json(),v=body.data,duration=Number(v?.duration)
  if(Number(body.retcode)!==200||String(v?.id)!==id||String(v?.father_info?.id)!==item.albumId||Number(v?.content_type)!==1||officialPage(v?.pageurl_iqiyi_pc)!==episode.url||Number(v?.order_info?.order)!==episode.order||!Number.isFinite(duration)||duration<10||duration>86400)throw fail('官网正片标识或完整时长核验未通过','UNSUPPORTED')
  return {...episode,episodeSeconds:duration,category:'电视剧'}
 }
 return {get,prepare,async close(){closed=true;controller.abort();await Promise.allSettled([...pending.values()])}}
}
