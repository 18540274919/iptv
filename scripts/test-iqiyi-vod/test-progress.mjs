import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {createProgress,mergeProgress} from '../../extractors/iqiyi-vod/scripts/progress.mjs'
const entry={id:'history-1234567890abcdef',duration:400,resumeSeconds:100,watchedAt:'1700000000',percent:25,completed:false}
test('local progress persists privately and a fresh service resumes it over older cloud progress',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'iqiyi-progress-'));const file=path.join(dir,'progress.json');const data={accountKey:'owner-a',items:[entry]}
 try{const progress=createProgress({file,now:()=>1800000000000}),token=progress.authorize(data,entry,402);await progress.save({id:entry.id,token,seconds:215});await progress.close()
 const fresh=createProgress({file});const result=await fresh.apply(data);assert.equal(result.items[0].resumeSeconds,215);assert.equal(result.items[0].duration,402);assert.equal(result.items[0].progressSource,'本机');assert.equal((await stat(file)).mode&0o777,0o600);await fresh.close()
 }finally{await rm(dir,{recursive:true,force:true})}
})
test('progress is scoped to account and prepared playback token, with no unauthorized or nonfinite saves',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'iqiyi-progress-'));try{const progress=createProgress({file:path.join(dir,'p.json'),now:()=>1800000000000});const data={accountKey:'a',items:[entry]},token=progress.authorize(data,entry,400)
 await assert.rejects(progress.save({id:entry.id,seconds:2}));await assert.rejects(progress.save({id:entry.id,token,seconds:Infinity}));await assert.rejects(progress.save({id:entry.id,token,seconds:9999}));await assert.rejects(progress.save({id:'another',token,seconds:5}));await progress.save({id:entry.id,token,seconds:210})
 assert.equal((await progress.apply({accountKey:'b',items:[entry]})).items[0].resumeSeconds,100);await progress.close()
 }finally{await rm(dir,{recursive:true,force:true})}
})
test('newer cloud progress wins and completed/restarted local entries remain explicit',()=>{
 const state={a:{[entry.id]:{seconds:250,duration:400,updatedAt:1700000000000}}}
 assert.equal(mergeProgress({accountKey:'a',items:[{...entry,watchedAt:'1900000000'}]},state).items[0].progressSource,'云端')
 state.a[entry.id]={seconds:400,duration:400,updatedAt:1800000000000,completed:true}
 const done=mergeProgress({accountKey:'a',items:[entry]},state).items[0];assert.equal(done.completed,true);assert.equal(done.resumeSeconds,0)
 state.a[entry.id]={seconds:3,duration:400,updatedAt:1800000000000,completed:false}
 assert.equal(mergeProgress({accountKey:'a',items:[entry]},state).items[0].resumeSeconds,3)
})

test('episode progress survives restart, appears in continue-watching, and merges with the same cloud video across entry IDs',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'iqiyi-episode-')),file=path.join(dir,'p.json')
 const item={id:'catalog-one',url:'https://www.iqiyi.com/v_episodeOne.html',title:'剧 第2集',episode:'2',album:'剧'},owner={accountKey:'a',items:[]},continuation={series:{albumId:'100',channelId:2,title:'剧',url:item.url},episodeId:'222'}
 try{const p=createProgress({file,now:()=>1800000000000}),token=p.authorize(owner,item,2746,continuation),id=p.context(token).id
 await p.save({token,id,seconds:425.3,sequence:1});await p.close()
 const fresh=createProgress({file}),local=(await fresh.apply(owner)).items
 assert.equal(local.length,1);assert.equal(local[0].resumeSeconds,425.3);assert.equal(local[0].episodeId,'222');assert.equal(local[0].series.albumId,'100')
 const merged=await fresh.apply({accountKey:'a',items:[{...item,id:'history-other',watchedAt:'1700000000',duration:2747,resumeSeconds:3}]})
 assert.equal(merged.items.length,1);assert.equal(merged.items[0].id,'history-other');assert.equal(merged.items[0].resumeSeconds,425.3)
 assert.equal((await fresh.apply({accountKey:'b',items:[]})).items.length,0)
 await fresh.close()
 }finally{await rm(dir,{recursive:true,force:true})}
})
test('late progress packets and superseded playback sessions cannot overwrite a newer episode position',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'iqiyi-order-'));try{
 const p=createProgress({file:path.join(dir,'p.json'),now:()=>1800000000000}),owner={accountKey:'a',items:[]},item={id:'catalog-one',url:'https://www.iqiyi.com/v_episodeOne.html',title:'剧 第1集'}
 const token=p.authorize(owner,item,400),id=p.context(token).id
 await p.save({token,id,seconds:200,sequence:2});await p.save({token,id,seconds:10,sequence:1});assert.equal((await p.apply(owner)).items[0].resumeSeconds,200)
 const newer=p.authorize(owner,item,400);await p.save({token:newer,id,seconds:230,sequence:1});await p.save({token,id,seconds:250,sequence:3});assert.equal((await p.apply(owner)).items[0].resumeSeconds,230)
 await p.save({token:newer,id,seconds:400,completed:true,sequence:2});assert.equal((await p.apply(owner)).items[0].completed,true);assert.equal((await p.apply(owner)).items[0].resumeSeconds,0)
 await p.close()
 }finally{await rm(dir,{recursive:true,force:true})}
})

test('sports VOD progress persists under its own canonical key and keeps the sports type on restart',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'iqiyi-sports-'));const file=path.join(dir,'p.json')
 try{
 const item={id:'history-1234567890abcdef',url:'https://sports.iqiyi.com/resource/pcw/play/1qm0nkjheyo',title:'测试集锦',kind:'体育'},owner={accountKey:'a',items:[]},p=createProgress({file,now:()=>1800000000000}),token=p.authorize(owner,item,394),id=p.context(token).id
 assert.match(id,/^video-[a-f0-9]{16}$/);await p.save({id,token,seconds:81,sequence:1});await p.close()
 const fresh=createProgress({file}),saved=(await fresh.apply(owner)).items[0];assert.equal(saved.kind,'体育');assert.equal(saved.resumeSeconds,81);assert.equal(saved.url,item.url);assert.equal(saved.series,undefined);await fresh.close()
 }finally{await rm(dir,{recursive:true,force:true})}
})
