import test from 'node:test'
import assert from 'node:assert/strict'
import {createCatalog,normalizeItems,discoverTabs,officialPage} from '../../extractors/iqiyi-vod/scripts/catalog.mjs'
const urls=['recommend','hot','new'].map(id=>'https://mesh.if.iqiyi.com/portal/lw/v7/channel/card/videoTab?data_source='+id)
const homepage={code:0,items:[{title:'正在热播',video:['推荐','最热','最新'].map((title,i)=>({title,tab_resource_url:urls[i]}))}]}
const entry=(id,title='正片')=>({tv_id:id,album_id:id,display_name:title,channel_id:2,content_type:'FEATURE_FILM',page_url:'https://www.iqiyi.com/v_'+id+'.html',description:'简介',pay_mark:'VIP_MARK',firstChildInfoStatus:'FREE',image_url_normal:'https://pic1.iqiyipic.com/a.jpg'})
const response=items=>({code:0,items:[{video:[{data:items}]}]})
test('preserves official order and deduplicates while filtering ads, promotions, non-features and external links',()=>{
 const body=response([entry('b'),{...entry('ad'),isAd:true},entry('a'),entry('b'),{...entry('trailer'),content_type:'TRAILER'},{...entry('outside'),page_url:'https://example.com/video'},{...entry('promo'),interactShow:{}},{...entry('religion'),tag:'宗教'}])
 const result=normalizeItems(body);assert.deepEqual(result.items.map(i=>i.id),['b','a']);assert.deepEqual(result.items.map(i=>i.position),[1,3]);assert.equal(result.filteredCount,6)
 assert.equal(result.items[0].membershipMark,'官网会员标记','free first episode never means the whole album is free')
})
test('rejects placeholder pages, credentials, unsafe images, and malformed responses',()=>{
 assert.equal(officialPage('https://www.iqiyi.com/tvg/to_page_url'),null);assert.equal(officialPage('https://user:pass@www.iqiyi.com/v_a.html'),null)
 assert.equal(normalizeItems(response([{...entry('a'),image_url_normal:'javascript:alert(1)'}])).items[0].cover,null)
 assert.throws(()=>normalizeItems({code:500,items:[]}));assert.throws(()=>normalizeItems({code:0,items:{}}))
})
test('discovers distinct tab URLs from the current homepage and rejects external upstreams',()=>{
 assert.equal(discoverTabs(homepage).new,urls[2]);const copy=structuredClone(homepage);copy.items[0].video[0].tab_resource_url='https://example.com/';assert.throws(()=>discoverTabs(copy))
})
test('anonymous direct API requests merge, cache separately per tab, and expire without borrowing another tab',async()=>{
 let time=0;const calls=[]
 const catalog=createCatalog({now:()=>time,ttlMs:10000,fetchImpl:async(url,options)=>{
  const u=new URL(url);calls.push({u,options});assert.equal(u.searchParams.get('uid'),'0');assert.equal(u.searchParams.get('vip'),'0');assert.ok(!('Cookie' in options.headers));
  return {ok:true,json:async()=>u.pathname.endsWith('/channel/recommend')?homepage:response([entry(u.searchParams.get('data_source'))])}
 }})
 const [a,b]=await Promise.all([catalog.get('recommend'),catalog.get('recommend')]);assert.equal(a,b);assert.equal(calls.length,2)
 assert.equal((await catalog.get('hot')).items[0].id,'hot');assert.equal((await catalog.get('new')).items[0].id,'new');assert.equal(calls.length,4)
 await catalog.get('recommend');assert.equal(calls.length,4);time=10001;await catalog.get('recommend');assert.equal(calls.length,6)
 await assert.rejects(catalog.get('search'),e=>e.code==='NOT_FOUND');await catalog.close()
})
test('failed refresh never republishes an expired catalog as fresh',async()=>{
 let time=0,broken=false;const catalog=createCatalog({now:()=>time,ttlMs:1000,fetchImpl:async url=>{if(broken)throw Error('offline');return {ok:true,json:async()=>new URL(url).pathname.endsWith('/channel/recommend')?homepage:response([entry('a')])}}})
 await catalog.get('hot');time=2000;broken=true;await assert.rejects(catalog.get('hot'),/暂时不可用/);await catalog.close()
})

import {registerCatalogSample,registerHistorySample,probeSamples} from '../../extractors/iqiyi-vod/scripts/samples.mjs'
test('homepage registration binds stable playback to the official episode URL, not album ID or supplied preview',()=>{
 const a={id:'album-1',title:'剧集',url:'https://www.iqiyi.com/v_catalogEpisodeA.html',episodeSeconds:2400,category:'电视剧'}
 const first=registerCatalogSample(a),same=registerCatalogSample({...a,id:'different-tab-id'})
 assert.equal(first,same);assert.match(first.id,/^catalog-[a-f0-9]{16}$/);assert.equal(first.expectedSeconds,2400)
 const next=registerCatalogSample({...a,url:'https://www.iqiyi.com/v_catalogEpisodeB.html'})
 assert.notEqual(first.id,next.id,'different episodes in one album cannot reuse a manifest')
 assert.equal(registerHistorySample({id:'history-1234567890abcdef',supported:true,title:'同集历史',url:a.url,duration:2400}),first,'history and homepage share one verified resolution')
 for(const bad of [{...a,url:'https://evil.example/v_a.html'},{...a,url:'https://www.iqiyi.com/a_a.html'},{...a,episodeSeconds:null},{...a,episodeSeconds:1},{...a,episodeSeconds:Infinity}])assert.throws(()=>registerCatalogSample(bad),e=>e.code==='UNSUPPORTED')
})
test('isolated probe descriptors allow validated catalog entries and reject forged origins or identifiers',()=>{
 const previous=process.env.IQIYI_DESCRIPTOR
 try{
  const item={id:'catalog-1234567890abcdef',title:'正片',url:'https://www.iqiyi.com/v_abc.html',expectedSeconds:2400}
  process.env.IQIYI_DESCRIPTOR=JSON.stringify(item);assert.deepEqual(probeSamples(),[item])
  for(const bad of [{...item,id:'../../profile'},{...item,url:'https://www.iqiyi.com.evil.example/v_abc.html'},{...item,expectedSeconds:0}]){process.env.IQIYI_DESCRIPTOR=JSON.stringify(bad);assert.throws(()=>probeSamples())}
 }finally{if(previous===undefined)delete process.env.IQIYI_DESCRIPTOR;else process.env.IQIYI_DESCRIPTOR=previous}
})
