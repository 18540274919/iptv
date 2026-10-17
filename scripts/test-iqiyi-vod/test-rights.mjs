import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
test('rights badges distinguish denied, temporary failure, expiry and verified playback without inferring VIP',async()=>{
 const listeners={},elements=[],window={addEventListener:(name,fn)=>{listeners[name]=fn}}
 const document={createElement:()=>({dataset:{}}),querySelectorAll:()=>elements}
 vm.runInNewContext(await readFile(new URL('../../extractors/iqiyi-vod/web/rights.js',import.meta.url),'utf8'),{window,document})
 const badge=window.playbackRights.badge('https://www.iqiyi.com/v_test.html');elements.push(badge)
 assert.equal(badge.textContent,'完整权限待核验')
 for(const [state,label] of [['denied','无完整权限'],['failed','暂时核验失败'],['expired','授权已到期 · 待核验'],['ready','完整播放已核验']]){
  listeners['playback-rights']({detail:[{url:badge.dataset.rightsUrl,state}]})
  assert.equal(badge.textContent,label);assert.equal(badge.dataset.rightsState,state)
 }
 listeners['playback-rights']({detail:[]});assert.equal(badge.textContent,'完整权限待核验','restart or a missing status must not preserve a verified badge')
})
