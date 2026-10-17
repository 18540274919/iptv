import {danmakuAttribute} from './unified-danmaku.mjs'
const scopes=['all','recommend','hot','new','history']
const fail=message=>Object.assign(new Error(message),{code:'UNAVAILABLE'})
const clean=value=>String(value).replace(/[\r\n"]/g,' ')
export function createCollectionExport({load,runtime,origin,now=Date.now}={}){
 let epoch=0;let entries=[],warnings=[],pending=null,closed=false,finished=false,checked=0,denied=0,failed=0,skipped=0,startedAt=null,finishedAt=null,current='',error=''
 const listeners=new Set()
 function notify(){for(const listener of [...listeners])listener()}
 function rows(scope='all'){
  if(!scopes.includes(scope))throw Object.assign(Error('未知清单分类'),{code:'NOT_FOUND'})
  const ready=new Set(runtime.status().filter(row=>row.state==='ready').map(row=>row.id))
  return entries.filter(entry=>(scope==='all'||entry.scope===scope)&&ready.has(entry.sample.id))
 }
 function status(){return {running:!!pending,finished,startedAt,finishedAt,total:new Set(entries.map(e=>e.sample.id)).size,checked,denied,failed,skipped,current,error,warnings,ready:Object.fromEntries(scopes.map(scope=>[scope,rows(scope).length]))}}
 function start(){
  if(closed)throw fail('清单服务已停止')
  if(pending)return pending
  const generation=++epoch
  entries=[];warnings=[];checked=denied=failed=skipped=0;startedAt=now();finishedAt=null;finished=false;current='正在读取首页与观看历史';error=''
  pending=(async()=>{
   try{
    const data=await load();if(generation!==epoch)return;entries=[...new Map(data.entries.map(entry=>[entry.scope+'|'+entry.sample.id,entry])).values()];warnings=data.warnings||[];skipped=data.skipped||0
    const unique=[...new Map(entries.map(entry=>[entry.sample.id,entry.sample])).values()]
    notify()
    for(const sample of unique){
     if(closed||generation!==epoch)break
     current=sample.title;notify()
     try{await runtime.verify(sample.id)}catch(error){if(error.code==='NOT_AUTHORIZED')denied++;else failed++}
     if(generation!==epoch)return
     checked++;notify()
    }
    if(!closed&&generation===epoch)finished=true
   }catch(cause){error=cause.message;warnings=[...warnings,'片单读取未完成，请重试']}
   finally{if(generation!==epoch)return;current='';finishedAt=now();pending=null;notify()}
  })()
  return pending
 }
 function text(scope='all',outputOrigin=origin){
  const published=rows(scope)
  if(!published.length)throw fail('该分类暂无当前完整权限核验通过的内容；请查看页面清单生成进度')
  return '#EXTM3U\n'+published.map(({sample,group})=>`#EXTINF:-1 group-title="${clean(group)}"${danmakuAttribute(sample.id,outputOrigin)},${clean(sample.title)}\n${outputOrigin}/play/${sample.id}.m3u8`).join('\n')+'\n'
 }
 async function playlist(scope='all',{waitMs=55000,origin:outputOrigin=origin}={}){
  rows(scope)
  if(rows(scope).length)return text(scope,outputOrigin)
  if(!pending)void start()
  await new Promise(resolve=>{
   const listener=()=>{if(closed||rows(scope).length||!pending){clearTimeout(timer);listeners.delete(listener);resolve()}}
   const timer=setTimeout(()=>{listeners.delete(listener);resolve()},waitMs)
   listeners.add(listener);listener()
  })
  return text(scope,outputOrigin)
 }
 return {invalidate(){epoch++;entries=[];pending=null;finished=false;checked=denied=failed=skipped=0;current='';notify()},start,status,text,playlist,async close(){closed=true;notify();await pending}}
}
