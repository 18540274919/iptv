import test from 'node:test'
import assert from 'node:assert/strict'
import {brotliCompressSync} from 'node:zlib'
import {bulletUrl,decodeBullets,createDanmaku} from '../../extractors/iqiyi-vod/scripts/danmaku.mjs'
import {partsAt,layoutBullets,visibleAt,createOverlay} from '../../extractors/iqiyi-vod/web/danmaku.js'
function vi(n){const out=[];do{let b=n%128;n=Math.floor(n/128);if(n)b|=128;out.push(b)}while(n);return Buffer.from(out)}
const field=(id,value)=>{const b=Buffer.isBuffer(value)?value:Buffer.from(String(value));return Buffer.concat([vi(id*8+2),vi(b.length),b])}
const packet=(time=5,text='测试')=>brotliCompressSync(Buffer.concat([field(1,'A00000'),field(6,Buffer.concat([field(1,time),field(2,Buffer.concat([field(1,'content-id'),field(2,text),field(6,time),field(8,'ff8800'),field(17,'private profile')]))]))]))
test('official public chunk URL matches the observed SDK output and cannot accept arbitrary hosts or invalid indexes',()=>{
 assert.equal(bulletUrl('1075449600',1),'https://cmts.iqiyi.com/bullet/96/00/1075449600_60_1_44b65218.br')
 for(const [id,part] of [['../host',1],['123',0],['123',1.5],['123',1441]])assert.throws(()=>bulletUrl(id,part))
})
test('Brotli protobuf decoding keeps only timeline/text/color and rejects damaged or mismatched segments',()=>{
 const data=decodeBullets(packet(5,'<img onerror=x>\u0000'),1);assert.deepEqual(Object.keys(data.items[0]),['id','time','text','color']);assert.equal(data.items[0].text,'<img onerror=x>');assert.equal(data.items[0].color,'#ff8800')
 assert.equal(decodeBullets(packet(65),1).items.length,0);assert.equal(decodeBullets(packet(65),2).items[0].time,65)
 assert.throws(()=>decodeBullets(Buffer.from('not Brotli'),1));assert.throws(()=>decodeBullets(brotliCompressSync(Buffer.from([10,200])),1))
})
test('chunk reads merge, cache, expire and distinguish empty from failed responses without sending credentials',async()=>{
 let count=0,time=0,status=200;const service=createDanmaku({now:()=>time,ttlMs:1000,fetchImpl:async(url,options)=>{count++;assert.ok(url.startsWith('https://cmts.iqiyi.com/bullet/'));assert.equal(options.headers.Cookie,undefined);return new Response(status===200?packet():null,{status})}})
 const [a,b]=await Promise.all([service.get('123',1),service.get('123',1)]);assert.equal(a,b);assert.equal(count,1);time=1001;await service.get('123',1);assert.equal(count,2)
 status=404;assert.equal((await service.get('123',2)).items.length,0);status=403;await assert.rejects(service.get('123',3));await service.close()
})
test('seeking uses only the target window plus boundary neighbours and never replays skipped comments',()=>{
 assert.deepEqual(partsAt(10,180),[1]);assert.deepEqual(partsAt(59,180),[1,2]);assert.deepEqual(partsAt(65,180),[1,2]);assert.deepEqual(partsAt(100,180),[2]);assert.deepEqual(partsAt(179,180),[3])
 const timeline=layoutBullets([{id:'a',time:5,text:'a'},{id:'b',time:65,text:'b'}],400,240,()=>20)
 assert.equal(visibleAt(timeline,6,400)[0].id,'a');assert.deepEqual(visibleAt(timeline,60,400),[]);assert.equal(visibleAt(timeline,66,400)[0].id,'b');assert.deepEqual(visibleAt(timeline,6,400),visibleAt(timeline,6,400),'a paused clock never drifts')
})
test('disabled and stale-video requests cannot render comments into a new playback session',async()=>{
 const names=['fetch','localStorage','devicePixelRatio','requestAnimationFrame','cancelAnimationFrame','ResizeObserver'],previous=Object.fromEntries(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));const requests=[],drawn=[]
 try{
  Object.defineProperty(globalThis,'localStorage',{configurable:true,writable:true,value:{getItem:()=>null,setItem(){}}});globalThis.devicePixelRatio=1;globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};globalThis.ResizeObserver=class{observe(){}}
  globalThis.fetch=(_url,options)=>new Promise(resolve=>requests.push({input:JSON.parse(options.body),signal:options.signal,resolve}))
  const video=Object.assign(new EventTarget(),{paused:true,ended:false,seeking:false,hidden:false,currentTime:5,videoWidth:1920,videoHeight:1080,getBoundingClientRect:()=>({width:400,height:225})}),toggle=Object.assign(new EventTarget(),{checked:true}),status={textContent:''}
  const ctx={clearRect(){drawn.length=0},setTransform(){},measureText:()=>({width:20}),save(){},beginPath(){},rect(){},clip(){},strokeText(){},fillText(text){drawn.push(text)},restore(){}},canvas={width:400,height:225,dataset:{},getContext:()=>ctx}
  const overlay=createOverlay(video,canvas,toggle,status);overlay.attach({token:'old',duration:180,supported:true});assert.equal(requests.length,1)
  overlay.attach({token:'new',duration:180,supported:true});assert.equal(requests.length,2);assert.equal(requests[0].signal.aborted,true)
  requests[1].resolve(new Response(JSON.stringify({part:1,items:[{id:'b',time:5,text:'new',color:'#ffffff'}]})));await new Promise(r=>setImmediate(r));assert.deepEqual(drawn,['new'])
  requests[0].resolve(new Response(JSON.stringify({part:1,items:[{id:'a',time:5,text:'old',color:'#ffffff'}]})));await new Promise(r=>setImmediate(r));assert.deepEqual(drawn,['new'])
  toggle.checked=false;toggle.dispatchEvent(new Event('change'));video.currentTime=90;video.dispatchEvent(new Event('timeupdate'));assert.equal(requests.length,2);assert.deepEqual(drawn,[])
  overlay.stop()
 }finally{for(const n of names){if(previous[n]===undefined)delete globalThis[n];else Object.defineProperty(globalThis,n,previous[n])}}
})
