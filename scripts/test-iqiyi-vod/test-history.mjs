import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeHistory,resumePosition,createHistory} from '../../extractors/iqiyi-vod/scripts/history.mjs'
import {registerHistorySample,samples} from '../../extractors/iqiyi-vod/scripts/samples.mjs'
import {blockedRequest} from '../../extractors/iqiyi-vod/scripts/read-only.mjs'
const record=(overrides={})=>({episodeId:'123',albumId:'456',title:'测试剧集',album_name:'测试剧',album_order:'1',duration:'1501',play_time:'317',watch_progress_percent:21,content_type:1,page_url:'https://www.iqiyi.com/v_test.html?tracking=ignored',image_url:'https://pic1.iqiyipic.com/cover.jpg',add_time:'1700000000',...overrides})
test('history preserves episode and cloud progress without accepting credential URLs or mixing different episodes',()=>{
 const rows=normalizeHistory([record(),record(),record({episodeId:'124',page_url:'https://www.iqiyi.com/v_second.html'}),record({page_url:'https://evil.test/video'}),record({page_url:'https://secret@www.iqiyi.com/v_test.html'})])
 assert.equal(rows.length,2);assert.equal(rows[0].resumeSeconds,317);assert.equal(rows[0].duration,1501);assert.equal(rows[0].supported,true)
 assert.equal(rows[0].url,'https://www.iqiyi.com/v_test.html');assert.notEqual(rows[0].id,rows[1].id)
})
test('sports live rooms, ordinary unsupported formats and missing durations remain official handoffs',()=>{
 for(const r of [record({page_url:'https://sports.iqiyi.com/resource/pcw/live/sample'}),record({content_type:5}),record({duration:'unknown'})])assert.equal(normalizeHistory([r])[0].supported,false)
})
test('resume clamps invalid or out-of-range positions, completed items explicitly restart',()=>{
 assert.equal(resumePosition(500,400),398);assert.equal(resumePosition(-2,400),0);assert.equal(resumePosition('bad',400),0);assert.equal(resumePosition(200,400,true),0)
 assert.equal(normalizeHistory([record({watch_progress_percent:100})])[0].resumeSeconds,0)
 assert.equal(normalizeHistory([record({watch_progress_percent:99,play_time:'1480'})])[0].resumeSeconds,1480)
})
test('registers only history records with validated public video pages and full official durations',()=>{
 const entry=normalizeHistory([record()])[0];const sample=registerHistorySample(entry)
 assert.equal(sample.expectedSeconds,1501);assert.equal(registerHistorySample(entry),sample)
 assert.throws(()=>registerHistorySample({...entry,id:'../../secret'}));assert.throws(()=>registerHistorySample({...entry,supported:false}))
 samples.splice(samples.indexOf(sample),1)
})
test('history requests merge and cache; expiry failure does not silently return stale progress or an empty list',async()=>{
 let calls=0,time=0,broken=false
 const history=createHistory({now:()=>time,ttlMs:1000,read:async()=>{calls++;if(broken)throw Object.assign(Error('请更新独立登录副本'),{code:'AUTH_REQUIRED'});return {items:normalizeHistory([record()]),isEnd:true}}})
 const [a,b]=await Promise.all([history.get(),history.get()]);assert.equal(a,b);assert.equal(calls,1)
 assert.equal((await history.find(a.items[0].id)).items,undefined);await assert.rejects(history.find('missing'),e=>e.code==='NOT_FOUND')
 time=1001;broken=true;await assert.rejects(history.get(),e=>e.code==='AUTH_REQUIRED');await assert.rejects(history.get());assert.equal(calls,2)
 await history.close()
})

test('read-only requests block legacy history image beacons and cloud writes while allowing the actual history read and playback media',()=>{
 for(const url of ['https://l-rcd.iqiyi.com/apis/ur','https://l.rcd.iqiyi.com/apis/ur','https://mesh.if.iqiyi.com/tvg/my/lw/clear_play_history'])assert.equal(blockedRequest({url,type:'image'}),'writes')
 assert.equal(blockedRequest({url:'https://mesh.if.iqiyi.com/tvg/my/lw/v2/play_history'}),null)
 assert.equal(blockedRequest({url:'https://www.iqiyi.com/upload',method:'POST'}),'writes')
 assert.equal(blockedRequest({url:'https://ly5cnc.71edge.com/videos/test.ts',type:'media'}),null)
 assert.equal(blockedRequest({url:'https://ly5cnc.71edge.com/videos/test.ts',type:'media'},{blockMedia:true}),'media')
})

test('official zero-duration TS placeholders do not become fragments or shift resume timing',async()=>{
 const {parseManifest}=await import('../../extractors/iqiyi-vod/scripts/runtime.mjs')
 const text='#EXTM3U\n#EXTINF:0,\nhttps://one.71edge.com/zero.ts\n#EXTINF:40,\nhttps://one.71edge.com/real.ts\n#EXTINF:0,\nhttps://one.71edge.com/zero2.ts\n#EXT-X-ENDLIST\n'
 const parsed=parseManifest(text,40);assert.equal(parsed.duration,40);assert.equal(parsed.segments.length,1);assert.equal(parsed.segments[0].start,0);assert.ok(!parsed.lines.some(l=>l.text==='#EXTINF:0,'))
 assert.throws(()=>parseManifest(text.replace('#EXTINF:40,','#EXTINF:-1,'),40))
})

test('sports VOD history is eligible for on-demand verification, while live rooms, previews and invalid lengths stay excluded',()=>{
 const row=record({page_url:'https://sports.iqiyi.com/resource/pcw/play/1qm0nkjheyo',duration:'394',content_type:5})
 const item=normalizeHistory([row])[0];assert.equal(item.supported,true);assert.equal(item.kind,'体育');assert.equal(registerHistorySample(item).url,item.url)
 for(const overrides of [{page_url:'https://sports.iqiyi.com/resource/pcw/live/example'},{content_type:3},{duration:0},{page_url:'https://sports.iqiyi.com.evil.test/resource/pcw/play/example'}]){
  const entries=normalizeHistory([{...row,...overrides}]);assert.ok(!entries.length||!entries[0].supported)
 }
})
