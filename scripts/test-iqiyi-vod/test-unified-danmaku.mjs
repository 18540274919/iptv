import test from 'node:test'
import assert from 'node:assert/strict'
import {createUnifiedDanmaku,videoIdentity,danmakuAttribute} from '../../extractors/iqiyi-vod/scripts/unified-danmaku.mjs'
const sample={id:'drama',title:'test',url:'https://www.iqiyi.com/v_test.html'}
test('unified association binds canonical video identity and a same-server endpoint without credentials',async()=>{
 const api=createUnifiedDanmaku({samples:[sample],runtime:{get:async()=>({duration:1501,danmaku:{videoId:'123'}})}})
 const data=await api.metadata('drama');assert.equal(data.schemaVersion,1);assert.equal(data.videoID,videoIdentity(sample));assert.equal(data.available,true)
 assert.equal(data.segmentsURL,'/api/danmaku/v1/videos/drama/segments');assert.doesNotMatch(JSON.stringify(data),/cookie|123/i)
 assert.match(danmakuAttribute('drama','http://127.0.0.1:8807'),/danmaku-url="http:\/\/127.0.0.1:8807\/api\/danmaku\/v1\/videos\/drama"/)
})
test('uniform packets preserve timing/color and reject arbitrary ids or out-of-range chunks',async()=>{
 const calls=[],api=createUnifiedDanmaku({samples:[sample],runtime:{get:async()=>({duration:100,danmaku:{videoId:'123'}})},danmaku:{get:async(id,part)=>{calls.push([id,part]);return {part,start:0,end:60,items:[{id:'1',time:2,text:'hello',color:'#ffffff'}]}}}})
 const data=await api.segment('drama',1);assert.equal(data.videoID,videoIdentity(sample));assert.equal(data.items[0].mode,'scroll');assert.deepEqual(calls,[['123',1]])
 for(const part of [0,3,NaN,1.1])await assert.rejects(api.segment('drama',part),e=>e.code==='BAD_REQUEST')
 await assert.rejects(api.metadata('forged'),e=>e.code==='NOT_FOUND')
})
test('metadata and packets require full rights, including revocation while a packet is in flight',async()=>{
 let denied=false,downloads=0
 const api=createUnifiedDanmaku({samples:[sample],runtime:{get:async()=>{if(denied)throw Object.assign(Error('denied'),{code:'NOT_AUTHORIZED'});return {duration:100,danmaku:{videoId:'123'}}}},danmaku:{get:async()=>{downloads++;denied=true;return {part:1,start:0,end:60,items:[]}}}})
 await assert.rejects(api.segment('drama',1),e=>e.code==='NOT_AUTHORIZED');assert.equal(downloads,1)
 await assert.rejects(api.metadata('drama'),e=>e.code==='NOT_AUTHORIZED');await assert.rejects(api.segment('drama',1),e=>e.code==='NOT_AUTHORIZED');assert.equal(downloads,1)
})
