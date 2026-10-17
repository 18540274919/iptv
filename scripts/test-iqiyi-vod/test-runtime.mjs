import test from 'node:test'
import assert from 'node:assert/strict'
import { createRuntime, parseManifest } from '../../extractors/iqiyi-vod/scripts/runtime.mjs'
const fixture=(sample,host='one.71edge.com',file=sample.id)=>({text:`#EXTM3U\n#EXT-X-TARGETDURATION:${sample.expectedSeconds}\n#EXTINF:${sample.expectedSeconds},\nhttps://${host}/${file}.ts?start=0&end=188&contentlength=188&sd=0\n#EXT-X-ENDLIST\n`})
const response=()=>new Response(new Uint8Array([71,0,0,0]),{headers:{'content-type':'video/mp2t'}})
function setup(options={}){let time=0,calls=0;const runtime=createRuntime({now:()=>time,ttlMs:10000,refreshAheadMs:3000,auto:false,resolve:async sample=>{calls++;return fixture(sample,calls===1?'one.71edge.com':'two.71edge.com')},...options});return {runtime,clock:t=>{time=t},calls:()=>calls}}
const version=text=>text.match(/\/media\/movie\/([^/]+)\//)[1]

test('cold requests merge into one official parse; fresh cache does not reopen browser',async()=>{
 const s=setup();const values=await Promise.all(Array.from({length:8},()=>s.runtime.manifest('movie')))
 assert.equal(s.calls(),1);assert.equal(new Set(values).size,1)
 await s.runtime.manifest('movie');assert.equal(s.calls(),1);await s.runtime.close()
})
test('long full-film manifests declare VOD in the bounded head used by playback-clock probes',async()=>{
 const s=setup({resolve:async sample=>({text:'#EXTM3U\n#EXT-X-TARGETDURATION:5\n'+Array.from({length:2000},(_,i)=>`#EXTINF:${sample.expectedSeconds/2000},\nhttps://one.71edge.com/film.ts?start=${i*188}&end=${i*188+187}&contentlength=376000&sd=0`).join('\n')+'\n#EXT-X-ENDLIST\n'})})
 const text=await s.runtime.manifest('movie'),head=Buffer.from(text).subarray(0,65536).toString('utf8')
 assert.ok(Buffer.byteLength(text)>65536);assert.doesNotMatch(head,/#EXT-X-ENDLIST/)
 assert.match(head,/^#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n/)
 assert.match(text,/#EXT-X-ENDLIST/);await s.runtime.close()
})
test('unknown generations never trigger an official browser parse',async()=>{
 const s=setup()
 await assert.rejects(s.runtime.media('movie','old-process-1',0),e=>e.code==='NOT_FOUND')
 assert.equal(s.calls(),0);await s.runtime.close()
})
test('renewal changes upstream but preserves old generation URLs and Range',async()=>{
 const fetched=[];const s=setup({fetchImpl:async(url,opts)=>{fetched.push({url,opts});return response()}})
 const old=version(await s.runtime.manifest('movie'));s.clock(7001);await s.runtime.tick()
 assert.equal(s.calls(),2);assert.notEqual(s.runtime.status()[0].version,old)
 const r=await s.runtime.media('movie',old,0,{range:'bytes=0-187'});assert.equal(r.status,200)
 assert.match(fetched[0].url,/two\.71edge/);assert.equal(fetched[0].opts.headers.Range,'bytes=0-187')
 await s.runtime.close()
})
test('expired manifest blocks for fresh authorization rather than publishing stale tickets',async()=>{
 const s=setup();const first=await s.runtime.manifest('movie');s.clock(10001)
 const next=await s.runtime.manifest('movie');assert.notEqual(first,next);assert.equal(s.calls(),2)
 await s.runtime.close()
})
test('concurrent expired fragments reauthorize once and retry against refreshed CDN',async()=>{
 const requests=[];const s=setup({fetchImpl:async url=>{requests.push(url);return url.includes('one.71edge')?new Response('',{status:403}):response()}})
 const old=version(await s.runtime.manifest('movie'))
 await Promise.all(Array.from({length:8},()=>s.runtime.media('movie',old,0)))
 assert.equal(s.calls(),2);assert.equal(requests.filter(u=>u.includes('two.71edge')).length,8)
 assert.equal(s.runtime.status()[0].lastReason,'upstream-refused');await s.runtime.close()
})
test('a second 403 fails without an infinite browser or request loop',async()=>{
 let fetches=0;const s=setup({fetchImpl:async()=>{fetches++;return new Response('',{status:403})}})
 const old=version(await s.runtime.manifest('movie'))
 await assert.rejects(s.runtime.media('movie',old,0),/续期后仍不可用/)
 assert.equal(s.calls(),2);assert.equal(fetches,2)
 await assert.rejects(s.runtime.media('movie',old,0),/稍后重试/)
 assert.equal(s.calls(),2,'repeated refusal observes backoff instead of reopening Chrome');assert.equal(fetches,3)
 await s.runtime.close()
})
test('renewal receiving a preview immediately denies cached generation playback',async()=>{
 let denied=false;const s=setup({resolve:async sample=>{if(denied)throw Object.assign(new Error('preview'),{code:'NOT_AUTHORIZED'});return fixture(sample)}})
 const old=version(await s.runtime.manifest('movie'));denied=true;s.clock(7001);await s.runtime.tick()
 assert.equal(s.runtime.status()[0].state,'denied')
 await assert.rejects(s.runtime.media('movie',old,0),e=>e.code==='NOT_AUTHORIZED');await s.runtime.close()
})
test('network failure preserves only an unexpired cache; hard expiry fails closed with backoff',async()=>{
 let broken=false,count=0;const s=setup({resolve:async sample=>{count++;if(broken)throw Error('network');return fixture(sample)}})
 const old=await s.runtime.manifest('movie');broken=true;s.clock(7001);await s.runtime.tick()
 assert.equal(await s.runtime.manifest('movie'),old);s.clock(10001)
 await assert.rejects(s.runtime.manifest('movie'))
 assert.equal(s.runtime.status()[0].state,'failed')
 await assert.rejects(s.runtime.media('movie',version(old),0))
 assert.equal(count,2,'backoff prevents repeated failures from reopening Chrome');await s.runtime.close()
})
test('cold authorization failure is distinguishable from missing full rights and publishes no manifest',async()=>{
 for(const code of ['UNAVAILABLE','NOT_AUTHORIZED']){
  const s=setup({resolve:async()=>{throw Object.assign(Error('failure'),{code})}})
  await assert.rejects(s.runtime.manifest('movie'),e=>e.code===code)
  assert.equal(s.runtime.status()[0].state,code==='NOT_AUTHORIZED'?'denied':'failed');await s.runtime.close()
 }
})
test('revocation during an in-flight media request cancels the response instead of supplying the old cache',async()=>{
 let finish,denied=false,cancelled=false;
 const s=setup({resolve:async sample=>{if(denied)throw Object.assign(Error('preview'),{code:'NOT_AUTHORIZED'});return fixture(sample)},fetchImpl:()=>new Promise(resolve=>{finish=()=>resolve(new Response(new ReadableStream({cancel(){cancelled=true}})))})})
 const old=version(await s.runtime.manifest('movie')),pending=s.runtime.media('movie',old,0)
 await new Promise(resolve=>setImmediate(resolve));denied=true;await assert.rejects(s.runtime.refresh('movie'));finish()
 await assert.rejects(pending,e=>e.code==='NOT_AUTHORIZED');assert.equal(cancelled,true)
 await assert.rejects(s.runtime.manifest('movie'),e=>e.code==='NOT_AUTHORIZED');await s.runtime.close()
})
test('idle samples do not renew until playback resumes',async()=>{
 const s=setup({activeMs:1000});await s.runtime.manifest('movie');s.clock(11000);await s.runtime.tick()
 assert.equal(s.calls(),1);await s.runtime.manifest('movie');assert.equal(s.calls(),2);await s.runtime.close()
})
test('background export verification does not activate endless playback renewal jobs',async()=>{
 const s=setup();await s.runtime.verify('movie');s.clock(7001);await s.runtime.tick()
 assert.equal(s.calls(),1);s.clock(10001);await s.runtime.tick();assert.equal(s.calls(),1)
 await s.runtime.manifest('movie');assert.equal(s.calls(),2);await s.runtime.close()
})
test('resolution or file layout changes do not mix incompatible old fragments',async()=>{
 let newer=false,fetches=0;const s=setup({resolve:async sample=>fixture(sample,'one.71edge.com',newer?'different-quality':sample.id),fetchImpl:async()=>{fetches++;return response()}})
 const old=version(await s.runtime.manifest('movie'));newer=true;await s.runtime.refresh('movie')
 await assert.rejects(s.runtime.media('movie',old,0),e=>e.code==='SEGMENT_CHANGED');assert.equal(fetches,0);await s.runtime.close()
})
test('one isolated account profile is never opened by concurrent movie and drama jobs',async()=>{
 let active=0,peak=0;const s=setup({resolve:async sample=>{active++;peak=Math.max(active,peak);await new Promise(r=>setTimeout(r,5));active--;return fixture(sample)}})
 await Promise.all([s.runtime.get('movie'),s.runtime.get('drama')]);assert.equal(peak,1);await s.runtime.close()
})
test('preview lengths, encryption and external origins are rejected',()=>{
 const sample={id:'movie',expectedSeconds:8146},text=fixture(sample).text
 assert.throws(()=>parseManifest(text.replace('#EXTINF:8146,','#EXTINF:180,'),8146),e=>e.code==='NOT_AUTHORIZED')
 assert.throws(()=>parseManifest(text.replace('#EXTM3U','#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="license"'),8146),e=>e.code==='UNSUPPORTED')
 assert.throws(()=>parseManifest(text.replace('one.71edge.com','127.0.0.1'),8146))
 assert.throws(()=>parseManifest(text.replace('one.71edge.com','71edge.com.example.com'),8146))
})

test('verified video identity remains attached to its own runtime generation for optional danmaku',async()=>{
 const s=setup({resolve:async sample=>({...fixture(sample),danmaku:sample.id==='drama'?{videoId:'1075449600'}:null})})
 assert.deepEqual((await s.runtime.get('drama')).danmaku,{videoId:'1075449600'});assert.equal((await s.runtime.get('movie')).danmaku,null);await s.runtime.close()
})
test('ticket lifetime is learned only from refusals that a fresh ticket cures, and reset restores it',async()=>{
 const {createRuntime}=await import('../../extractors/iqiyi-vod/scripts/runtime.mjs')
 let time=0,refuse=0;const events=[]
 const runtime=createRuntime({auto:false,now:()=>time,onEvent:e=>events.push(e),
  resolve:async sample=>({text:`#EXTM3U\n#EXTINF:${sample.expectedSeconds},\nhttps://fixture.71edge.com/a.ts\n#EXT-X-ENDLIST`}),
  fetchImpl:async()=>refuse-->0?new Response('',{status:403}):new Response(new Uint8Array([0x47]),{headers:{'content-type':'video/mp2t'}})})
 const version=()=>runtime.status().find(s=>s.id==='movie').version
 await runtime.manifest('movie');time=600000;refuse=2
 await assert.rejects(runtime.media('movie',version(),0))
 assert.equal(events.filter(e=>e.outcome==='lifetime-learned').length,0,'新票也被拒（出口问题）不算票龄')
 time+=31000;await runtime.manifest('movie');time+=600000;refuse=1
 assert.equal((await runtime.media('movie',version(),0)).status,200)
 const learned=events.filter(e=>e.outcome==='lifetime-learned');assert.equal(learned.length,1);assert.equal(learned[0].lifetimeMs,631000,'票龄从被拒的那张票签发时算')
 runtime.reset();await runtime.manifest('movie')
 assert.equal(runtime.status().find(s=>s.id==='movie').nextRefreshAt-time,1800000-90000,'换账号后恢复默认续期')
 await runtime.close()
})
