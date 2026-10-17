import { browserJob } from '../jobs.js'
import { runtimeDir } from '../paths.js'
import {videoPage} from './video-page.mjs'
import {createHash} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const root=fileURLToPath(new URL('../',import.meta.url)),exec=promisify(execFile)
const error=(message,code='UNAVAILABLE')=>Object.assign(new Error(message),{code})
export function historyPage(value){try{const u=new URL(value);return ['https://www.iqiyi.com','https://sports.iqiyi.com'].includes(u.origin)&&!u.username&&!u.password?u.origin+u.pathname:null}catch{return null}}
export function resumePosition(position,duration,completed=false){const time=Number(position),length=Number(duration);return completed||!Number.isFinite(time)||time<0||!(length>0)?0:Math.min(time,Math.max(0,length-2))}
export function normalizeHistory(records){
 const seen=new Set(),items=[]
 for(const r of records){
  const url=historyPage(r.page_url);if(!url)continue
  const key=String(r.episodeId||'')+'|'+url;if(seen.has(key))continue;seen.add(key)
  const id='history-'+createHash('sha256').update(key).digest('hex').slice(0,16),duration=Number(r.duration),percent=Number(r.watch_progress_percent),completed=percent>=100
  const supported=!!videoPage(url)&&Number.isFinite(duration)&&duration>=10&&duration<=86400&&(Number(r.content_type)===1||(new URL(url).hostname==='sports.iqiyi.com'&&Number(r.content_type)===5))
  let cover;try{const u=new URL(r.image_url);if(u.protocol==='https:'&&/(^|\.)iqiyipic\.com$/.test(u.hostname))cover=u.href}catch{}
  items.push({id,contentType:Number(r.content_type),title:String(r.title||r.album_name||'未命名视频'),album:String(r.album_name||''),episode:Number(r.album_order)>0?String(r.album_order):'',url,cover:cover||null,duration:Number.isFinite(duration)?duration:0,
   resumeSeconds:resumePosition(r.play_time,duration,completed),percent:Number.isFinite(percent)?Math.max(0,Math.min(100,percent)):0,completed,
   watchedAt:String(r.add_time||''),supported,kind:new URL(url).hostname==='sports.iqiyi.com'?'体育':'视频',unsupportedReason:supported?'':'此入口暂需在官网播放，独立播放器未支持该类型或缺少可信完整时长'})
 }
 // Preserve the cloud service's newest-first ordering, not string-sorted dates.
 return items
}
export async function readCloudHistory({signal}={}){
 try{await readFile(path.join(runtimeDir,'snapshot-path.txt'),'utf8')}catch(error){if(error.code==='ENOENT')throw Object.assign(new Error('尚未登录爱奇艺账号'),{code:'AUTH_REQUIRED'});throw error}
 const jobs=path.join(runtimeDir,'jobs');await mkdir(jobs,{recursive:true,mode:0o700});const out=await mkdtemp(path.join(jobs,'history-')),file=path.join(out,'history.json')
 try{
  await browserJob(path.join(root,'scripts/history-probe.mjs'),{cwd:root,env:{...process.env,IQIYI_HISTORY_OUTPUT:file},signal,timeout:100000,maxBuffer:1024*1024})
  const result=JSON.parse(await readFile(file,'utf8'))
  if(result.error)throw error(result.error,result.code||'UNAVAILABLE')
  return {...result,items:normalizeHistory(result.records),records:undefined}
 }catch(e){if(e.code==='AUTH_REQUIRED'||e.code==='UNAVAILABLE')throw e;throw error('观看历史读取失败，请检查独立登录副本或稍后重试')}
 finally{await rm(out,{recursive:true,force:true})}
}
export function createHistory({read=readCloudHistory,now=Date.now,ttlMs=60000}={}){
 let cached,pending,retryAt=0,lastError,closed=false,epoch=0;const controller=new AbortController()
 async function get({refresh=false}={}){
  if(closed)throw error('历史服务已停止')
  if(cached&&now()-cached.fetchedAt<ttlMs&&(!refresh||now()-cached.fetchedAt<10000))return cached
  if(pending)return pending
  if(now()<retryAt)throw lastError
  const startedEpoch=epoch
  pending=(async()=>{try{const result=await read({signal:controller.signal});if(startedEpoch!==epoch)throw error('账号已变化，请重新读取历史','AUTH_REQUIRED');cached={...result,fetchedAt:now()};retryAt=0;return cached}catch(e){lastError=error(e.message,e.code);retryAt=now()+15000;throw lastError}})().finally(()=>{pending=null})
  return pending
 }
 return {invalidate(){epoch++;cached=undefined;retryAt=0},get,async find(id){const data=await get();const item=data.items.find(i=>i.id===id);if(!item)throw error('历史记录已更新，请刷新列表','NOT_FOUND');return item},async close(){closed=true;controller.abort();await pending?.catch(()=>{})}}
}
