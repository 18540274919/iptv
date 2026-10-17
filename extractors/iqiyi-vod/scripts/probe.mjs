import { launchWithFallback } from '../../../utils/browserLauncher.js'
import { runtimeDir } from '../paths.js'
import { createRequire } from 'node:module'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { probeSamples } from './samples.mjs'
import { validateMedia,parseManifest } from './runtime.mjs'
import { blockedRequest } from './read-only.mjs'
const allSamples=probeSamples()
const require = createRequire(import.meta.url)
let puppeteer
try { puppeteer = require('puppeteer-core') }
catch { puppeteer = require('puppeteer') }
const root = fileURLToPath(new URL('../', import.meta.url))
const out = process.env.IQIYI_REPORT_DIR ? path.resolve(process.env.IQIYI_REPORT_DIR) : path.join(root, 'research')
if(out!==path.join(root,'research') && !out.startsWith(path.join(runtimeDir,'jobs')+path.sep)) throw new Error('Invalid isolated output directory')
await mkdir(out, { recursive:true, mode:0o700 })
const samples = process.env.IQIYI_SAMPLE_ID ? allSamples.filter(s=>s.id===process.env.IQIYI_SAMPLE_ID) : allSamples
if(!samples.length) throw new Error('Unknown sample')
// A temporary Chrome profile and isolated contexts: no connection to any existing
// browser endpoint, profile, cookies or account. Never import the main app.
const memberProfile = process.env.IQIYI_PROFILE
if (memberProfile && !path.resolve(memberProfile).startsWith(runtimeDir+path.sep)) throw new Error('Only an isolated snapshot inside this lab is allowed')
const browser = await launchWithFallback({launchImpl:opts=>puppeteer.launch(opts),launchOptions:{ ...(memberProfile ? {userDataDir:memberProfile} : {}), headless:true,
 args:['--mute-audio','--autoplay-policy=no-user-gesture-required','--no-first-run'] }})
try {
 for (const sample of samples) {
  // Reuse only this lab's account cookies. An ephemeral page context prevents
  // playback history/codec preferences from switching later jobs to AV1 DASH.
  const context = await browser.createBrowserContext()
  if(memberProfile)await context.setCookie(...await browser.defaultBrowserContext().cookies())
  const page = await context.newPage()
  await page.setRequestInterception(true)
  page.on('request',request=>{
   const blocked=blockedRequest({url:request.url(),method:request.method(),type:request.resourceType()})
   void (blocked?request.abort():request.continue()).catch(()=>{})
  })
  // Each renewal must observe a fresh official response, including when the
  // isolated profile already cached this title during an earlier resolution.
  await page.setCacheEnabled(false)
  await page.setBypassServiceWorker(true)
  // This TS/HLS adapter advertises AVC compatibility only. The official player
  // still performs its normal authorization and chooses its compatible stream.
  await page.evaluateOnNewDocument(()=>{
   const unsupported=type=>/av01|hev1|hvc1|vp09/i.test(type||'')
   const canPlay=HTMLMediaElement.prototype.canPlayType
   HTMLMediaElement.prototype.canPlayType=function(type){return unsupported(type)?'':canPlay.call(this,type)}
   if(window.MediaSource){const supported=MediaSource.isTypeSupported.bind(MediaSource);MediaSource.isTypeSupported=type=>!unsupported(type)&&supported(type)}
   if(navigator.mediaCapabilities){const info=navigator.mediaCapabilities.decodingInfo.bind(navigator.mediaCapabilities);navigator.mediaCapabilities.decodingInfo=config=>unsupported(config.video?.contentType)?Promise.resolve({supported:false,smooth:false,powerEfficient:false}):info(config)}
  })
  const captures=[], tasks=new Set(), dispatches=new Map()
  const report={...sample, testedAt:new Date().toISOString(), account:memberProfile ? 'authorized account snapshot, original profile untouched' : 'fresh anonymous isolated context', dash:[], mediaResponses:[], mediaEndpoints:[], playbackEndpoints:[], networkEndpoints:[]}
  await page.setViewport({width:1440,height:960})
  page.on('response',response=>{
   const task=(async()=>{
    const u=new URL(response.url())
    if(u.hostname==='mesh.if.iqiyi.com'&&/^\/player\/(?:pcw|lw)\/video\/playervideoinfo$/.test(u.pathname)&&new URL(sample.url).hostname==='www.iqiyi.com'){
     try{const data=(await response.json()).data,official=new URL(data.vu);if(official.hostname==='www.iqiyi.com'&&official.pathname===new URL(sample.url).pathname&&/^\d+$/.test(String(data.tvid)))report.videoId=String(data.tvid)}catch{}
    }
    if(/\.(ts|mp4|m4s)$/.test(u.pathname) && u.hostname!=='data.video.iqiyi.com' && response.ok() && !report.mediaEndpoints.some(e=>e.path===u.pathname&&e.host===u.hostname))report.mediaEndpoints.push({host:u.hostname,path:u.pathname,status:response.status()})
    if(u.hostname==='data.video.iqiyi.com' && u.pathname==='/v.f4v') {
     const body=JSON.parse((await response.text()).replace(/^[\w.$]+\s*\(/,'').replace(/\);?\s*$/,''))
     function visit(value){
      if(typeof value==='string' && /^https?:/.test(value)) {
       try{const target=new URL(value);if(/\.(ts|mp4|f4v)$/.test(target.pathname) && target.hostname!=='data.video.iqiyi.com')dispatches.set(target.pathname,target.href)}catch{}
      }else if(value && typeof value==='object')for(const child of Object.values(value))visit(child)
     }
     visit(body)
     console.log(JSON.stringify({sample:sample.id,officialDispatcherCode:body.code,authorizedMediaFiles:dispatches.size}))
    }
    if (['xhr','fetch'].includes(response.request().resourceType()) && report.networkEndpoints.length<70) report.networkEndpoints.push({host:u.hostname,path:u.pathname,status:response.status()})
    if (/dash|vms|cache\.video|playback/.test(u.hostname+u.pathname) && report.playbackEndpoints.length<35) report.playbackEndpoints.push({host:u.hostname,path:u.pathname,status:response.status()})
    if (/(^|\.)(?:iqiyi|qiyi)\.com$/.test(u.hostname) && /\/(?:jp\/)?dash$/.test(u.pathname)) {
     try {
      const text=(await response.text()).trim().replace(/^[\w.$]+\s*\(/,'').replace(/\);?\s*$/,'')
      const body=JSON.parse(text),data=body.data
      const videos=data?.program?.video || []
      const info={code:body.code, tvid:data?.tvid, dataKeys:Object.keys(data || {}), videos:[]}
      for(const [i,v] of videos.entries()) {
       const manifest=typeof v.m3u8==='string' && v.m3u8.startsWith('#EXTM3U') ? v.m3u8 : ''
       const duration=[...manifest.matchAll(/^#EXTINF:([\d.]+)/gm)].reduce((s,m)=>s+Number(m[1]),0)
       const item={bid:v.bid,format:v.ff,codec:v.code,size:v.scrsz,drmType:v.drmType,isPreview:v.isPreview,ptt:v.ptt,expectedDuration:v.duration,
        hasInlineHls:!!manifest,hasManifestUrl:typeof v.m3u8==='string' && /^https?:/.test(v.m3u8),duration,segments:(manifest.match(/^#EXTINF:/gm)||[]).length,
        endList:/^#EXT-X-ENDLIST\s*$/m.test(manifest),keyMethods:[...manifest.matchAll(/^#EXT-X-(?:SESSION-)?KEY:METHOD=([^,\r\n]+)/gm)].map(m=>m[1]),fields:Object.keys(v)}
       if(manifest) {
        const file=`${sample.id}-${captures.length}-${i}.m3u8`
        await writeFile(path.join(out,file),manifest,{mode:0o600})
        item.manifestFile=file
       }
       info.videos.push(item)
      }
      captures.push(info);report.dash.push(info)
      console.log(JSON.stringify({sample:sample.id,dashCode:body.code,videos:info.videos.map(({fields,...v})=>v)}))
     } catch(e) { report.captureError=e.message.slice(0,120) }
    }
    const ct=response.headers()['content-type'] || ''
    if(/\.m3u8$|\.mpd$/.test(u.pathname) || /mpegurl|dash\+xml/.test(ct)) {
     report.mediaResponses.push({host:u.hostname,type:ct,status:response.status()})
     if(response.ok() && (/\.(m3u8|mpd)$/.test(u.pathname) || /mpegurl|dash\+xml/.test(ct))) {
      let raw
      // Chrome may start decoding a resumed VOD while CDP never completes
      // response.text(). Bound that read and refetch the exact official URL.
      let bodyTimer
      try {raw=await Promise.race([response.text(),new Promise((_,reject)=>{bodyTimer=setTimeout(()=>reject(new Error('Manifest body read timeout')),4000)})])} catch {
       const r=await fetch(response.url(),{headers:{Referer:sample.url,'User-Agent':response.request().headers()['user-agent'] || 'Mozilla/5.0'},signal:AbortSignal.timeout(20000)})
       if(!r.ok) throw new Error(`Manifest refetch HTTP ${r.status}`)
       raw=await r.text()
      } finally {clearTimeout(bodyTimer)}
      const rawFile=`${sample.id}-response-${report.mediaResponses.length}.txt`
      await writeFile(path.join(out,rawFile),raw,{mode:0o600})
      report.mediaResponses.at(-1).body={file:rawFile,length:raw.length,format:raw.trimStart().startsWith('#EXTM3U')?'hls':/<MPD[ >]/.test(raw)?'dash-mpd':'other',contentProtection:[...raw.matchAll(/<ContentProtection[^>]*schemeIdUri="([^"]+)"/g)].map(m=>m[1])}
      if(/<MPD[ >]/.test(raw) && !/<ContentProtection\b/.test(raw)){
       const seconds=Number(raw.match(/mediaPresentationDuration="PT([\d.]+)S"/)?.[1])
       if(Math.abs(seconds-sample.expectedSeconds)<=10)report.fullClearMpd={seconds,paths:[...new Set([...raw.matchAll(/(?:media|sourceURL)="([^"]+)"/g)].map(m=>new URL(m[1].replace(/&amp;/g,'&'),response.url()).pathname))]}
      }
      if(!raw.startsWith('#EXTM3U')) {captures.push({source:'other official manifest'});console.log(JSON.stringify({sample:sample.id,manifestBody:report.mediaResponses.at(-1).body}))}
      if(raw.startsWith('#EXTM3U')) {
       const text=raw.split('\n').map(line=>line && !line.startsWith('#') ? new URL(line.trim(),response.url()).href : line.replace(/URI="([^"]+)"/g,(_m,uri)=>`URI="${new URL(uri,response.url()).href}"`)).join('\n')
       const duration=[...text.matchAll(/^#EXTINF:([\d.]+)/gm)].reduce((s,m)=>s+Number(m[1]),0)
       const file=`${sample.id}-observed-${captures.length}.m3u8`
       await writeFile(path.join(out,file),text,{mode:0o600})
       const info={code:'HTTP_200',source:'official player HLS response',videos:[{codec:null,hasInlineHls:true,duration,segments:(text.match(/^#EXTINF:/gm)||[]).length,endList:/^#EXT-X-ENDLIST\s*$/m.test(text),keyMethods:[...text.matchAll(/^#EXT-X-(?:SESSION-)?KEY:METHOD=([^,\r\n]+)/gm)].map(m=>m[1]),manifestFile:file}]}
       captures.push(info); report.dash.push(info)
       console.log(JSON.stringify({sample:sample.id,observedHlsSeconds:duration,keyMethods:info.videos[0].keyMethods,segments:info.videos[0].segments}))
      }
     }
    }
   })().catch(e=>{report.responseError=String(e.message).replace(/https?:\/\/\S+/g,'[URL]').slice(0,180);console.log(JSON.stringify({sample:sample.id,responseError:report.responseError}))})
   tasks.add(task);task.finally(()=>tasks.delete(task))
  })
  try {
   const response=await page.goto(sample.url,{waitUntil:'domcontentloaded',timeout:40000})
   report.http=response.status()
   for(let i=0;i<75 && !report.dash.some(d=>d.videos?.some(v=>v.hasInlineHls));i++) await new Promise(r=>setTimeout(r,1000))
   if(report.dash.length) await new Promise(r=>setTimeout(r,10000))
   // Standard VOD HLS lists scheduler paths, not the final CDN. Ask the
   // official player's scheduler result, then verify every distinct media file.
   const observed=report.dash.flatMap(d=>d.videos || []).find(v=>v.manifestFile)
   if(observed){
    const manifestPath=path.join(out,observed.manifestFile)
    const text=await readFile(manifestPath,'utf8'),timeline=new Map()
    let at=0,part=0
    for(const line of text.split('\n')){
     if(line.startsWith('#EXTINF:'))part=Number(line.match(/#EXTINF:([\d.]+)/)?.[1] || 0)
     else if(line && !line.startsWith('#')){const u=new URL(line);if(!timeline.has(u.pathname))timeline.set(u.pathname,at);at+=part}
    }
    const authorizedPaths=new Set([...timeline.keys(),...(report.fullClearMpd?.paths||[])])
    for(let i=0;i<15 && ![...dispatches.keys()].some(p=>authorizedPaths.has(p)) && !report.mediaEndpoints.some(e=>authorizedPaths.has(e.path));i++)await new Promise(r=>setTimeout(r,1000))
    // Match a body-media path in this sample's HLS or full clear MPD, never an
    // unrelated advertisement. Verify each HLS file on that observed CDN.
    // Preserve catalog paths/ranges; never invent signatures or change entitlement.
    const matchingDispatches=[...dispatches].filter(([mediaPath])=>authorizedPaths.has(mediaPath)).map(([,url])=>new URL(url).origin)
    const matchingResponses=[...report.mediaEndpoints,...report.networkEndpoints].filter(e=>authorizedPaths.has(e.path)&&e.host!=='data.video.iqiyi.com'&&[200,206].includes(e.status)).map(e=>`https://${e.host}`)
    const cdnOrigins=[...new Set([...matchingDispatches,...matchingResponses])].filter(origin=>/(^|\.)(71edge\.com|iqiyi\.com|qiyi\.com)$/.test(new URL(origin).hostname))
    if(cdnOrigins.length){
     const firstByPath=new Map(text.split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>{const u=new URL(l);return [u.pathname,u]}))
     const pendingPaths=[...timeline.keys()]
     for(let start=0;start<pendingPaths.length;start+=3)await Promise.all(pendingPaths.slice(start,start+3).map(async mediaPath=>{
      const source=firstByPath.get(mediaPath)
      const targets=[...new Set([...(dispatches.has(mediaPath)?[dispatches.get(mediaPath)]:[]),...cdnOrigins.map(origin=>new URL(source.pathname+source.search,origin).href)])].filter(value=>{try{validateMedia(value);return true}catch{return false}})
      dispatches.delete(mediaPath)
      for(const url of targets)try{
       const target=new URL(url)
       for(const [key,value] of source.searchParams)target.searchParams.set(key,value)
       const r=await fetch(target,{headers:{Referer:sample.url,'User-Agent':'Mozilla/5.0',Range:'bytes=0-1023'},signal:AbortSignal.timeout(12000)})
       const reader=r.body.getReader(),{value}=await reader.read();await reader.cancel()
       if(r.ok && value?.[0]===0x47){dispatches.set(mediaPath,target.href);break}
      }catch{}
     }))
    }
    await Promise.race([Promise.allSettled([...tasks]),new Promise(r=>setTimeout(r,10000))])
    const resolved=text.split('\n').map(line=>{
     if(!line || line.startsWith('#'))return line
     const source=new URL(line),signed=dispatches.get(source.pathname)
     if(!signed)return line
     const target=new URL(signed)
     for(const [key,value] of source.searchParams)target.searchParams.set(key,value)
     return target.href
    }).join('\n')
    const file=`${sample.id}-resolved.m3u8`
    await writeFile(path.join(out,file),resolved,{mode:0o600})
    try{parseManifest(resolved,sample.expectedSeconds)}catch(error){
     report.error=error.message
     let pendingDuration=null;const shape=[]
     for(const line of resolved.split('\n')){if(line.startsWith('#EXTINF:'))pendingDuration=line.split(':')[1].split(',')[0];else if(line&&!line.startsWith('#')){const u=new URL(line);shape.push({duration:pendingDuration,extension:u.pathname.split('.').pop(),protocol:u.protocol});pendingDuration=null}}
     await writeFile(path.join(runtimeDir,'manifest-shape-'+sample.id+'.json'),JSON.stringify(shape),{mode:0o600})
    }
    observed.schedulerFiles=timeline.size;observed.resolvedFiles=[...timeline.keys()].filter(p=>dispatches.has(p)).length
    observed.manifestFile=file
    report.scheduler={files:timeline.size,resolved:observed.resolvedFiles}
    console.log(JSON.stringify({sample:sample.id,scheduler:report.scheduler}))
    await page.evaluate(()=>{const v=[...document.querySelectorAll('video')].find(v=>v.duration>300);if(v)v.currentTime=0})
   }
   report.title=await page.title()
   report.video=await page.evaluate(()=>[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,duration:Number.isFinite(v.duration)?v.duration:null,paused:v.paused,readyState:v.readyState,width:v.videoWidth,height:v.videoHeight,error:v.error?.code || null})))
   report.pageText=await page.evaluate(()=>document.body.innerText.slice(0,6500))
   report.preferenceKeys=await page.evaluate(()=>Object.keys(localStorage).filter(k=>/player|codec|decode|av1|dash|hls|format/i.test(k)))
   if(process.env.IQIYI_CAPTURE_SCREENSHOT!=='0') await page.screenshot({path:path.join(out,`${sample.id}-official.png`)})
  } catch(e) {report.error=e.message.split('\n')[0]}
  await Promise.race([Promise.allSettled([...tasks]),new Promise(r=>setTimeout(r,10000))])
  report.dispatchPaths=[...dispatches.keys()]
  await writeFile(path.join(out,`${sample.id}.json`),JSON.stringify(report,null,2))
  console.log(JSON.stringify({sample:sample.id,title:report.title,http:report.http,captures:captures.length,video:report.video,error:report.error}))
  if(memberProfile)await browser.defaultBrowserContext().setCookie(...await context.cookies())
  await context.close().catch(()=>{})
 }
} finally {await browser.close()}
