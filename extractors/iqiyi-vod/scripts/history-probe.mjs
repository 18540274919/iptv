import { launchWithFallback } from '../../../utils/browserLauncher.js'
import { copyCookies } from '../profile.js'
import { runtimeDir } from '../paths.js'
// Read-only investigation of the owner's explicitly authorized isolated login.
// No player, history writes, deletion, original profile, or main app access.
import {createRequire} from 'node:module'
import {createHash} from 'node:crypto'
import {readFile,writeFile,mkdir,mkdtemp,copyFile,rm,realpath} from 'node:fs/promises'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import path from 'node:path'
import { blockedRequest } from './read-only.mjs'
import {fileURLToPath} from 'node:url'
const require=createRequire(import.meta.url);let puppeteer;try{puppeteer=require('puppeteer-core')}catch{puppeteer=require('puppeteer')}
const root=fileURLToPath(new URL('../',import.meta.url)),work=path.join(runtimeDir,'history-research'),exec=promisify(execFile)
await mkdir(work,{recursive:true,mode:0o700})
const source=await realpath((await readFile(path.join(runtimeDir,'snapshot-path.txt'),'utf8')).trim())
if(!source.startsWith(runtimeDir+path.sep))throw Error('Only this lab’s isolated snapshot is allowed')
const outputPath=process.env.IQIYI_HISTORY_OUTPUT?path.resolve(process.env.IQIYI_HISTORY_OUTPUT):null
if(outputPath&&!outputPath.startsWith(path.join(runtimeDir,'jobs')+path.sep))throw Error('History output must remain in a private job')
const profile=await mkdtemp(path.join(outputPath?path.dirname(outputPath):work,'profile-'))
for(const name of ['Local State','Default/Preferences','Default/Secure Preferences'])try{await mkdir(path.dirname(path.join(profile,name)),{recursive:true});await copyFile(path.join(source,name),path.join(profile,name))}catch(e){if(e.code!=='ENOENT')throw e}
await copyCookies(source,profile)
let browser;const history=[],tasks=new Set(),network=[],blocked={media:0,writes:0,other:0}
try{
 browser=await launchWithFallback({launchImpl:opts=>puppeteer.launch(opts),launchOptions:{headless:true,userDataDir:profile,args:['--mute-audio','--no-first-run']}})
 const context=await browser.createBrowserContext();await context.setCookie(...await browser.defaultBrowserContext().cookies())
 const page=await context.newPage();await page.setViewport({width:1440,height:960});await page.setRequestInterception(true)
 page.on('request',request=>{
  const u=new URL(request.url()),method=request.method(),type=request.resourceType()
  const reason=blockedRequest({url:u.href,method,type},{blockMedia:true})
  if(reason){blocked[reason]++;void request.abort().catch(()=>{});return}
  if(['xhr','fetch','ping'].includes(type)){
   // Allow read-only official metadata/account/history, never ad or playback
   // reporting hosts. GET history reads use the website's normal SDK signing.
   if(!['mesh.if.iqiyi.com','static.iqiyi.com','passport.iqiyi.com','www.iqiyi.com'].includes(u.hostname)){blocked.other++;void request.abort();return}
   if(type==='ping'||/pingback|\/report|\/log\b|\/playrecord\/(?!get)/i.test(u.pathname)){blocked.writes++;void request.abort();return}
  }
  void request.continue()
 })
 page.on('response',response=>{
  const u=new URL(response.url());if(u.hostname!=='mesh.if.iqiyi.com')return
  if(/history|passport|userInfo|login|record/i.test(u.pathname)&&network.length<60)network.push({path:u.pathname,status:response.status()})
  if(!/\/v2\/play_history$/.test(u.pathname))return
  const task=(async()=>{try{const body=await response.json();history.push({path:u.pathname,status:response.status(),method:response.request().method(),parameterNames:[...u.searchParams.keys()],page:u.searchParams.get('page_num'),pageSize:u.searchParams.get('page_size'),onlyLong:u.searchParams.get('only_long'),accountKey:u.searchParams.get('user_id')?createHash('sha256').update(u.searchParams.get('user_id')).digest('hex'):null,body})}catch{}})();tasks.add(task);task.finally(()=>tasks.delete(task))
 })
 await page.goto('https://www.iqiyi.com/',{waitUntil:'domcontentloaded',timeout:40000})
 await page.waitForFunction(()=>[...document.querySelectorAll('span,div')].some(e=>e.textContent==='历史'&&e.children.length===0),{timeout:30000})
 const target=await page.evaluateHandle(()=>[...document.querySelectorAll('span,div')].find(e=>e.textContent==='历史'&&e.children.length===0))
 await target.asElement().hover()
 for(let i=0;i<20&&!history.some(h=>h.onlyLong==='0'&&h.body.status_code===0);i++)await new Promise(r=>setTimeout(r,1000))
 await Promise.race([Promise.allSettled([...tasks]),new Promise(r=>setTimeout(r,5000))])
 const hints=await page.evaluate(()=>{const text=document.body.innerText;return {loginPrompt:text.includes('登录同步观看历史'),historyText:text.includes('观看历史'),emptyText:/暂无观看记录|暂无观看历史|还没有观看记录/.test(text)}})
 // Persist diagnostics only. Viewing titles, timestamps, progress values and
 // credentials stay in memory; there is no raw history export by default.
 const summary={testedAt:new Date().toISOString(),requestCount:history.length,blocked,hints,network,requests:history.map(h=>{const d=h.body.data,records=d?.records||[];const pageHosts={};for(const record of records)try{const host=new URL(record.page_url).hostname;pageHosts[host]=(pageHosts[host]||0)+1}catch{};return {path:h.path,status:h.status,method:h.method,page:h.page,pageSize:h.pageSize,onlyLong:h.onlyLong,parameterNames:h.parameterNames,code:h.body.status_code,bodyKeys:Object.keys(h.body),dataKeys:Object.keys(d||{}),isEnd:d?.is_end,recordCount:records.length,recordKeys:records[0]?Object.keys(records[0]):[],pageHosts,hasPositiveProgress:records.some(x=>Number(x.play_time)>0)}})}
 if(process.env.IQIYI_HISTORY_OUTPUT){
  const output=path.resolve(process.env.IQIYI_HISTORY_OUTPUT)
  if(!output.startsWith(path.join(runtimeDir,'jobs')+path.sep))throw Error('History output must remain in a private job')
  const full=history.filter(h=>h.onlyLong==='0'&&h.body.status_code===0&&Array.isArray(h.body.data?.records)).sort((a,b)=>b.body.data.records.length-a.body.data.records.length)[0]
  const owner=history.find(h=>h.accountKey)?.accountKey
  const data=full&&owner?{accountKey:owner,records:full.body.data.records,isEnd:Number(full.body.data.is_end)===1,page:Number(full.body.data.page_num),sourceCount:full.body.data.records.length}:{error:'未取得有效的账号云端历史，请更新独立登录副本后重试',code:history.some(h=>h.body.status_code!==0)||!history.length?'AUTH_REQUIRED':'UNAVAILABLE'}
  await writeFile(output,JSON.stringify(data),{mode:0o600})
 }else{
  await writeFile(path.join(work,'summary.json'),JSON.stringify(summary,null,2),{mode:0o600});console.log(JSON.stringify(summary,null,2))
 }
}finally{await browser?.close();await rm(profile,{recursive:true,force:true})}
