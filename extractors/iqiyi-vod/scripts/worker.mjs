import { browserJob } from '../jobs.js'
import { cloneProfile } from '../profile.js'
import { runtimeDir } from '../paths.js'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseManifest } from './runtime.mjs'
const exec=promisify(execFile), root=fileURLToPath(new URL('../',import.meta.url))
export async function resolveOfficial(sample,{signal}={}) {
  const jobs=path.join(runtimeDir,'jobs')
  await mkdir(jobs,{recursive:true,mode:0o700})
  const out=await mkdtemp(path.join(jobs,sample.id+'-'))
  let stage='profile'
  try {
    let profile
    try {
      profile=await realpath((await readFile(path.join(runtimeDir,'snapshot-path.txt'),'utf8')).trim())
      if(!profile.startsWith(runtimeDir+path.sep)) throw new Error('Invalid isolated profile')
    } catch(error) {if(error.code!=='ENOENT')throw error}
    const env={...process.env,IQIYI_SAMPLE_ID:sample.id,IQIYI_REPORT_DIR:out,IQIYI_CAPTURE_SCREENSHOT:'0'}
    delete env.IQIYI_DESCRIPTOR
    if(/^(history|catalog)-/.test(sample.id))env.IQIYI_DESCRIPTOR=JSON.stringify(sample)
    delete env.IQIYI_PROFILE
    if(profile){const isolated=path.join(out,'profile');await cloneProfile(profile,isolated);env.IQIYI_PROFILE=isolated}
    stage='official-page'
    await browserJob(path.join(root,'scripts/probe.mjs'),{cwd:root,env,signal,timeout:150000,maxBuffer:1024*1024})
    const report=JSON.parse(await readFile(path.join(out,sample.id+'.json'),'utf8'))
    const options=report.dash.flatMap(d=>d.videos||[])
    const candidate=options.find(v=>v.hasInlineHls && v.endList && Math.abs(v.duration-sample.expectedSeconds)<=10
      && v.schedulerFiles>0 && v.resolvedFiles===v.schedulerFiles && !v.keyMethods.some(m=>m!=='NONE')
      && Number(v.isPreview||0)!==1 && Number(v.ptt||0)===0 && [undefined,null,0,1].includes(v.drmType))
    if(!candidate || report.error) {
      const preview=options.some(v=>v.duration>0 && v.duration<sample.expectedSeconds-10) || /试看[\s\S]{0,40}后结束|观看完整视频请/.test(report.pageText||'')
      throw Object.assign(new Error(preview?'官方仅返回试看或没有完整观看权益，请更新独立登录副本':'官方完整播放解析未完成，请稍后重试'),{code:preview?'NOT_AUTHORIZED':'UNAVAILABLE'})
    }
    stage='decode'
    const manifestPath=path.join(out,path.basename(candidate.manifestFile))
    const parsed=parseManifest(await readFile(manifestPath,'utf8'),sample.expectedSeconds)
    const text=parsed.lines.map(line=>line.segment!==undefined?parsed.segments[line.segment].url:line.text).join('\n')
    await writeFile(manifestPath,text,{mode:0o600})
    await exec('python3',[path.join(root,'scripts/verify.py')],{cwd:root,env,signal,timeout:100000,maxBuffer:1024*1024})
    const verified=JSON.parse(await readFile(path.join(out,'verification.json'),'utf8'))[0]
    if(!verified?.completeClearHlsVerified)throw new Error('官方媒体开头或后段解码未通过，未发布新清单')
    return {text,seconds:candidate.duration,danmaku:report.videoId?{videoId:report.videoId}:null,officialPage:sample.url,checks:verified.checks}
  } catch(error) {
    // Keep only diagnostic metadata; signed manifests and account data stay in
    // the disposable job and never appear in API responses or event logs.
    let detail={}
    try {
      const report=JSON.parse(await readFile(path.join(out,sample.id+'.json'),'utf8'))
      detail={http:report.http,video:report.video,captures:report.dash?.length,scheduler:report.scheduler,
        mediaResponses:report.mediaResponses?.map(({host,type,status,body})=>({host,type,status,format:body?.format})),
        mediaEndpoints:report.mediaEndpoints,networkEndpoints:report.networkEndpoints,dispatchPaths:report.dispatchPaths,
        error:report.error?.replace(/https?:\/\/\S+/g,'[URL]'),responseError:report.responseError}
    } catch {}
    await writeFile(path.join(runtimeDir,sample.id+'-last-failure.json'),JSON.stringify({at:new Date().toISOString(),stage,code:error.code||'UNAVAILABLE',...detail},null,2),{mode:0o600}).catch(()=>{})
    if(error.code==='NOT_AUTHORIZED')throw error
    throw Object.assign(new Error('爱奇艺官方解析或解码暂未完成，稍后重试；已保存的独立登录态保留'),{code:'UNAVAILABLE'})
  } finally {await rm(out,{recursive:true,force:true})}
}
