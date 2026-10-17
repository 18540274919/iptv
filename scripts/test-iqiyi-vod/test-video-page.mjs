import test from 'node:test'
import assert from 'node:assert/strict'
import {videoPage} from '../../extractors/iqiyi-vod/scripts/video-page.mjs'
import {probeSamples} from '../../extractors/iqiyi-vod/scripts/samples.mjs'
test('only exact official ordinary and sports VOD pages enter playback; reject live rooms, arbitrary paths and credentials',()=>{
 const sports='https://sports.iqiyi.com/resource/pcw/play/1qm0nkjheyo'
 assert.equal(videoPage(sports),sports);assert.ok(videoPage('https://www.iqiyi.com/v_example.html'))
 for(const url of ['https://sports.iqiyi.com/resource/pcw/live/id','https://sports.iqiyi.com/resource/pcw/play/id/extra','https://sports.iqiyi.com.evil.test/resource/pcw/play/id','https://secret@sports.iqiyi.com/resource/pcw/play/id','http://sports.iqiyi.com/resource/pcw/play/id',sports+'?url=https://evil.test',sports+'#x'])assert.equal(videoPage(url),null)
 const previous=process.env.IQIYI_DESCRIPTOR
 try{process.env.IQIYI_DESCRIPTOR=JSON.stringify({id:'history-1234567890abcdef',url:sports,expectedSeconds:394});assert.equal(probeSamples()[0].url,sports)}finally{if(previous===undefined)delete process.env.IQIYI_DESCRIPTOR;else process.env.IQIYI_DESCRIPTOR=previous}
})
