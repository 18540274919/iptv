import {videoPage} from './video-page.mjs'
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises'
import path from 'node:path'
import {randomBytes,createHash} from 'node:crypto'
const fail=message=>Object.assign(new Error(message),{code:'BAD_REQUEST'})
export function cloudTime(value){const n=Number(value);if(Number.isFinite(n)&&n>0)return n<1e12?n*1000:n;const t=Date.parse(value);return Number.isFinite(t)?t:0}
export function progressId(item){return videoPage(item.url)?'video-'+createHash('sha256').update(item.url).digest('hex').slice(0,16):item.id}
export function mergeProgress(result,state){
 const records=state[result.accountKey]||{}
 const source=[...result.items],urls=new Set(source.map(i=>i.url));
 for(const [id,saved] of Object.entries(records)){if(saved.item?.url&&!urls.has(saved.item.url)){source.push({...saved.item,id,duration:saved.duration,resumeSeconds:0,percent:0,completed:false,watchedAt:'0',supported:true,kind:saved.item.kind||'视频'});urls.add(saved.item.url)}}
 const items=source.map(item=>{const candidates=[records[progressId(item)],records[item.id]].filter(Boolean).sort((a,b)=>b.updatedAt-a.updatedAt),saved=candidates[0];if(!saved||saved.updatedAt<=cloudTime(item.watchedAt))return {...saved?.item,...item,progressSource:'云端'}
  const duration=Number(saved.duration)>0?Number(saved.duration):item.duration,seconds=Math.min(Math.max(0,saved.seconds),Math.max(0,duration-2)),completed=saved.completed===true
  return {...saved.item,...item,duration,resumeSeconds:completed?0:seconds,completed,percent:completed?100:Math.min(99,100*seconds/duration),watchedAt:String(saved.updatedAt),progressSource:'本机'}
 })
 if(items.some(i=>i.progressSource==='本机'))items.sort((a,b)=>cloudTime(b.watchedAt)-cloudTime(a.watchedAt))
 return {...result,items}
}
export function createProgress({file,now=Date.now}={}){
 let state,loading,closed=false,serial=Promise.resolve();const prepared=new Map(),latest=new Map()
 async function load(){if(state)return state;if(!loading)loading=(async()=>{try{const value=JSON.parse(await readFile(file,'utf8'));state=value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch(e){if(e.code!=='ENOENT')throw Error('本机进度文件无法读取');state={}}return state})();return loading}
 async function apply(result){return mergeProgress(result,await load())}
 function authorize(result,item,duration,continuation,playback){if(!result.accountKey)throw Error('未取得当前账号标识');const token=randomBytes(16).toString('hex');prepared.set(token,{id:progressId(item),accountKey:result.accountKey,duration,item:item.url?{url:item.url,title:item.title,kind:new URL(item.url).hostname==='sports.iqiyi.com'?'体育':'视频',album:item.album||'',episode:item.episode||'',series:continuation?.series,episodeId:continuation?.episodeId}:undefined,continuation,playback,sequence:0});latest.set(result.accountKey+'|'+progressId(item),token);if(prepared.size>256)prepared.delete(prepared.keys().next().value);return token}
 async function save(input){
  if(closed)throw fail('本机进度服务已停止');const context=prepared.get(input?.token);if(!context||context.id!==input?.id)throw fail('请先打开此条历史记录播放')
  if(latest.get(context.accountKey+'|'+context.id)!==input.token)return {ignored:true}
  const seconds=Number(input.seconds);if(!Number.isFinite(seconds)||seconds<0||seconds>context.duration+5)throw fail('进度数值无效')
  if(input.sequence!==undefined){if(!Number.isSafeInteger(input.sequence)||input.sequence<=context.sequence)return {ignored:true};context.sequence=input.sequence}
  const record={item:context.item,duration:context.duration,seconds:Math.min(seconds,context.duration),completed:input.completed===true,updatedAt:now()}
  const task=serial.catch(()=>{}).then(async()=>{await load();state[context.accountKey]??={};state[context.accountKey][input.id]=record
   await mkdir(path.dirname(file),{recursive:true,mode:0o700});const temporary=file+'.tmp';await writeFile(temporary,JSON.stringify(state),{mode:0o600});await rename(temporary,file)
  });serial=task;await task;return record
 }
 return {reset(){prepared.clear();latest.clear()},apply,authorize,save,context(token){const value=prepared.get(token);if(!value||latest.get(value.accountKey+'|'+value.id)!==token)throw fail('播放会话已失效，请重新选择剧集');return value},async close(){closed=true;await serial.catch(()=>{})}}
}
