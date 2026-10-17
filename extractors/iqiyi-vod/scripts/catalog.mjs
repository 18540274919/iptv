import { randomBytes } from 'node:crypto'
export const homeTabs=[{id:'recommend',label:'推荐'},{id:'hot',label:'最热'},{id:'new',label:'最新'}]
const origin='https://mesh.if.iqiyi.com',endpoint='/portal/lw/v7/channel/card/videoTab'
const invalid=message=>Object.assign(new Error(message),{code:'UNAVAILABLE'})
export function officialPage(value){
 try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='www.iqiyi.com'&&!u.username&&!u.password&&/^\/[va]_[a-zA-Z0-9]+\.html$/.test(u.pathname)?u.origin+u.pathname:null}catch{return null}
}
function image(value){try{const u=new URL(value);return u.protocol==='https:'&&/(^|\.)iqiyipic\.com$/.test(u.hostname)&&!u.username&&!u.password?u.href:null}catch{return null}}
export function normalizeItems(body){
 if(Number(body?.code)!==0||!Array.isArray(body.items))throw invalid('官网片单返回格式变化，未使用旧解析结果替代')
 const raw=body.items.flatMap(i=>i.video||[]).flatMap(v=>v.data||[]),seen=new Set(),items=[]
 for(const [index,v] of raw.entries()){
  const url=officialPage(v.page_url),title=v.display_name||v.title
  if(!url||!title||v.isAd||v.isPpcAd||v.isNativePriceAd||v.isGame||v.isCommand||v.interactShow)continue
  if(v.content_type!=='FEATURE_FILM'||/宗教|religion/i.test([v.channel_name,v.tag].filter(Boolean).join(' ')))continue
  const id=String(v.album_id||v.tv_id||v.entity_id||url)
  if(seen.has(id))continue
  seen.add(id)
  items.push({id,albumId:v.album_id?String(v.album_id):null,position:index+1,title:String(title),url,category:({1:'电影',2:'电视剧',4:'动漫',6:'综艺'})[v.channel_id]||'其他',
   channelId:v.channel_id,cover:image(v.image_url_normal||v.image_url||v.image_cover),description:String(v.description||v.desc||'').slice(0,2400),
   subtitle:String(v.desc||''),update:String(v.dq_updatestatus||''),score:Number(v.sns_score)>0?String(v.sns_score):'',
   year:v.date?.year||null,episodeSeconds:Number(v.time_length)||null,tvId:v.tv_id?String(v.tv_id):null,
   membershipMark:v.pay_mark==='VIP_MARK'?'官网会员标记':v.pay_mark&&v.pay_mark!=='NONE_MARK'?'官网付费标记':'',
   actors:(v.starring||v.contributor||[]).slice(0,6).map(a=>String(a.name||'')).filter(Boolean)})
 }
 return {items,sourceCount:raw.length,filteredCount:raw.length-items.length}
}
export function discoverTabs(body){
 const card=body?.items?.find(i=>i.title==='正在热播')
 const result={}
 for(const tab of homeTabs){
  const value=card?.video?.find(v=>v.title===tab.label)?.tab_resource_url
  const u=new URL(value||'https://invalid.local')
  if(u.origin!==origin||u.pathname!==endpoint||u.username||u.password)throw invalid('官网正在热播标签入口变化，请更新适配')
  result[tab.id]=u.href
 }
 return result
}
export function createCatalog({fetchImpl=fetch,now=Date.now,ttlMs=600000}={}){
 const device=randomBytes(16).toString('hex'),controller=new AbortController(),cache=new Map(),pending=new Map()
 let discovery,discovering,discoveredAt=0,closed=false
 async function read(url){
  if(closed)throw invalid('独立片单服务已停止')
  const r=await fetchImpl(url,{headers:{Referer:'https://www.iqiyi.com/','User-Agent':'Mozilla/5.0'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(20000)])})
  if(!r.ok)throw invalid('官网片单请求失败（HTTP '+r.status+'）')
  return r.json()
 }
 async function getTabs(){
  if(discovery&&now()-discoveredAt<ttlMs)return discovery
  if(discovering)return discovering
  discovering=(async()=>{
   // Public parameters observed on the current official desktop homepage.
   // Use a new anonymous device id, never the user's account or cookies.
   const u=new URL('/portal/lw/v5/channel/recommend',origin)
   for(const [k,v] of Object.entries({uid:'0',vip:'0',device,scale:'100',brightness:'dark',pcv:'17.102.26596',v:'17.102.26596',width:'1440',mode:'page',page:'1',conduit_id:'PPStream',isLowPerformPC:'0',osShortName:'win10',numOfRes:'0',from:'webapp',agenttype:'1',platformcode:'b6c13e26323c537d',focusMicroDramaEligible:'1'}))u.searchParams.set(k,v)
   const tabs=discoverTabs(await read(u));discovery=tabs;discoveredAt=now();return tabs
  })().finally(()=>{discovering=null})
  return discovering
 }
 async function get(id,{refresh=false}={}){
  if(!homeTabs.some(t=>t.id===id))throw Object.assign(new Error('未知首页标签'),{code:'NOT_FOUND'})
  const previous=cache.get(id)
  if(previous&&now()-previous.fetchedAt<ttlMs&&(!refresh||now()-previous.fetchedAt<10000))return previous
  if(pending.has(id))return pending.get(id)
  const task=(async()=>{
   try{
    const tabs=await getTabs(),u=new URL(tabs[id]);u.searchParams.set('uid','0');u.searchParams.set('vip','0');u.searchParams.set('device',device);u.searchParams.set('from','webapp')
    const normalized=normalizeItems(await read(u))
    if(!normalized.items.length)throw invalid('官网此标签暂未返回可展示的正片')
    const value={tab:id,label:homeTabs.find(t=>t.id===id).label,...normalized,fetchedAt:now(),expiresAt:now()+ttlMs,source:'https://www.iqiyi.com/',personalized:false,scope:'官网正在热播首屏，按原顺序；已过滤广告、营销卡片和非正片',rightsVerified:false}
    cache.set(id,value);return value
   }catch(error){if(error.code==='UNAVAILABLE')throw error;throw invalid('官网片单暂时不可用，请稍后重试')}
  })().finally(()=>pending.delete(id));pending.set(id,task);return task
 }
 return {get,async close(){closed=true;controller.abort();await Promise.allSettled([...pending.values()])}}
}
