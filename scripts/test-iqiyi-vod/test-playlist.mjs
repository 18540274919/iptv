import test from 'node:test'
import assert from 'node:assert/strict'
import {authorizedPlaylist} from '../../extractors/iqiyi-vod/scripts/playlist.mjs'
const samples=[{id:'movie',title:'电影'},{id:'drama',title:'电视剧'}]
test('export excludes preview and failed checks even when a prior status claims ready',async()=>{
 const runtime={get:async id=>{if(id==='movie')throw Object.assign(Error('preview'),{code:'NOT_AUTHORIZED'})},status:()=>samples.map(s=>({...s,state:'ready'}))}
 const text=await authorizedPlaylist(runtime,samples,'http://127.0.0.1:8807')
 assert.match(text,/\/play\/drama.m3u8/);assert.doesNotMatch(text,/\/play\/movie.m3u8/)
})
test('no new M3U is published when all rights checks fail or are unknown',async()=>{
 for(const code of ['NOT_AUTHORIZED','UNAVAILABLE'])await assert.rejects(authorizedPlaylist({get:async()=>{throw Object.assign(Error('failure'),{code})},status:()=>[]},samples,'http://127.0.0.1:8807'),e=>e.code==='UNAVAILABLE')
})
test('export rechecks status so expiry or revocation during generation cannot publish old entries',async()=>{
 for(const state of ['expired','denied','failed']){
  const runtime={get:async()=>{},status:()=>[{id:'movie',state},{id:'drama',state:'ready'}]}
  const text=await authorizedPlaylist(runtime,samples,'http://127.0.0.1:8807')
  assert.doesNotMatch(text,/\/play\/movie.m3u8/);assert.match(text,/\/play\/drama.m3u8/)
 }
})
