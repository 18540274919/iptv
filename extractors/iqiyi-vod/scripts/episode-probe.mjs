import { launchWithFallback } from '../../../utils/browserLauncher.js'
import { runtimeDir } from '../paths.js'
// Read the public official selector through its own SDK; no account profile.
import {createRequire} from 'node:module'
import {writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {blockedRequest} from './read-only.mjs'
import {normalizeEpisodes} from './episodes.mjs'
const item=JSON.parse(process.env.IQIYI_EPISODE_ITEM||'null'),out=process.env.IQIYI_EPISODE_OUTPUT||'',root=fileURLToPath(new URL('../',import.meta.url))
if(!item||!/^\d+$/.test(item.albumId)||!/^https:\/\/www\.iqiyi\.com\/v_[a-zA-Z0-9]+\.html$/.test(item.url)||!path.resolve(out).startsWith(path.join(runtimeDir,'jobs')+path.sep))throw Error('Invalid isolated episode request')
const require=createRequire(import.meta.url);let puppeteer;try{puppeteer=require('puppeteer-core')}catch{puppeteer=require('puppeteer')}
const browser=await launchWithFallback({launchImpl:opts=>puppeteer.launch(opts),launchOptions:{headless:true,args:['--no-sandbox']}})
try{
 const page=await browser.newPage();await page.setRequestInterception(true)
 page.on('request',r=>blockedRequest({url:r.url(),method:r.method(),type:r.resourceType()},{blockMedia:true})?r.abort():r.continue())
 let resolveResult;const result=new Promise(resolve=>{resolveResult=resolve})
 page.on('response',r=>{if(new URL(r.url()).origin==='https://mesh.if.iqiyi.com'&&new URL(r.url()).pathname==='/tvg/v2/lw/base_info')void(async()=>{try{resolveResult(normalizeEpisodes(await r.json(),item.albumId))}catch{}})()})
 let timer;const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Selector timeout')),55000)})
 try{const value=await Promise.race([(async()=>{await page.goto(item.url,{waitUntil:'domcontentloaded',timeout:40000});return result})(),deadline]);await writeFile(out,JSON.stringify(value),{mode:0o600})}finally{clearTimeout(timer)}
}finally{await browser.close()}
