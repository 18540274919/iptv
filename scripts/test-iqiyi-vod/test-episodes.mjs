import test from 'node:test'
import assert from 'node:assert/strict'
import {normalizeEpisodes,createEpisodes} from '../../extractors/iqiyi-vod/scripts/episodes.mjs'
const episode=(id,order,extra={})=>({qipu_id:id,album_order:order,content_type:1,page_url:'https://www.iqiyi.com/v_ep'+id+'.html',title:'剧第'+order+'集',pay_mark:1,...extra})
const body=rows=>({status_code:0,data:{base_data:{qipu_id:100,title:'剧',total_episode:60,update_info:{update_status:'更新至3集'}},template:{tabs:[{blocks:[{bk_type:'album_episodes',data:{data:[{entity_id:100,videos:{feature_count:3,feature_paged:{'1-2':rows.slice(0,2),'3-4':rows.slice(2)}}}]}}]}]}}})
test('selector gathers returned pages, filters previews and other albums, deduplicates then orders real episodes',()=>{
 const data=body([episode(2,2),episode(1,1),episode(9,3,{content_type:3}),episode(3,3),episode(3,3),episode(5,5,{page_url:'https://evil.example/video'})])
 data.data.template.tabs[0].blocks.push({bk_type:'recommend',data:{data:[{entity_id:100,videos:{feature_paged:{x:[episode(8,8)]}}}]}})
 const result=normalizeEpisodes(data,'100');assert.deepEqual(result.items.map(e=>e.id),['1','2','3']);assert.equal(result.complete,true);assert.equal(result.total,60);assert.equal(result.available,3)
 assert.throws(()=>normalizeEpisodes(data,'101'));const partial=normalizeEpisodes(body([episode(1,1)]),'100');assert.equal(partial.complete,false);assert.ok(partial.warning)
})
test('series cache merges concurrent reads, expires and never silently returns stale lists on failure',async()=>{
 let count=0,time=0,broken=false;const item={channelId:2,albumId:'100'},service=createEpisodes({now:()=>time,ttlMs:1000,read:async()=>{count++;if(broken)throw Error('offline');return normalizeEpisodes(body([episode(1,1)]),'100')}})
 const [a,b]=await Promise.all([service.get(item),service.get(item)]);assert.equal(a,b);assert.equal(count,1)
 await assert.rejects(service.get({...item,channelId:1}),e=>e.code==='UNSUPPORTED');time=1001;broken=true;await assert.rejects(service.get(item));await service.close()
})
test('episode preparation fetches its own full metadata and rejects wrong episode, album, page, preview type or duration',async()=>{
 const list=normalizeEpisodes(body([episode(1,1),episode(2,2)]),'100'),item={channelId:2,albumId:'100'}
 let metadata={id:2,father_info:{id:100},order_info:{order:2},pageurl_iqiyi_pc:list.items[1].url,content_type:1,duration:2747},calls=0
 const service=createEpisodes({read:async()=>list,fetchImpl:async(url,options)=>{calls++;assert.equal(url.origin,'https://mesh.if.iqiyi.com');assert.equal(url.searchParams.get('id'),'2');assert.ok(!options.headers.Cookie);return {ok:true,json:async()=>({retcode:200,data:metadata})}}})
 const prepared=await service.prepare(item,'2');assert.equal(prepared.episodeSeconds,2747);assert.equal(prepared.url,list.items[1].url)
 await assert.rejects(service.prepare(item,'999'),e=>e.code==='NOT_FOUND');assert.equal(calls,1)
 const original={...metadata}
 for(const overrides of [{id:3},{father_info:{id:101}},{order_info:{order:1}},{pageurl_iqiyi_pc:list.items[0].url},{content_type:3},{duration:0},{duration:Infinity}]){metadata={...original,...overrides};await assert.rejects(service.prepare(item,'2'),e=>e.code==='UNSUPPORTED')}
 await service.close()
})

import {nextEpisode} from '../../extractors/iqiyi-vod/scripts/episodes.mjs'
test('continuous playback selects only the immediate next real episode and stops at gaps or the available end',()=>{
 const items=[{id:'one',order:1},{id:'two',order:2},{id:'four',order:4}]
 assert.equal(nextEpisode({items,total:4},'one').next.id,'two')
 assert.equal(nextEpisode({items,total:4},'two').next,null);assert.match(nextEpisode({items,total:4},'two').reason,/暂缺/)
 assert.match(nextEpisode({items,total:4},'four').reason,/最后/)
 assert.match(nextEpisode({items,total:6},'four').reason,/尚未上线/)
 assert.throws(()=>nextEpisode({items,total:4},'other'),e=>e.code==='NOT_FOUND')
})
