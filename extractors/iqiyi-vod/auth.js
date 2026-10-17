import path from 'node:path'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createBrowserAuth } from '../iqiyi-sports/auth.js'
import { runtimeDir } from './paths.js'
export function createVODAuth() {
  const profile = path.join(runtimeDir, 'profile')
  const marker = path.join(runtimeDir, 'snapshot-path.txt')
  const auth = createBrowserAuth({ profile, accountOnly: true, label: '爱奇艺影视', getEvent: async () => undefined })
  async function prepare() {
    await mkdir(runtimeDir, { recursive: true, mode: 0o700 })
    await mkdir(profile, { recursive: true, mode: 0o700 })
  }
  // The marker means "a login was verified": history and playback workers read the profile
  // only after that. Close the login browser afterwards so Chromium flushes its cookie database
  // before a worker snapshots it (otherwise the first play right after an import could see the
  // old cookies and be judged preview-only).
  async function settle() {
    if (!auth.flow.status().authenticated) return
    await writeFile(marker, profile, { mode: 0o600 })
    await auth.shutdown()
  }
  return {
    status: () => {
      const state = auth.flow.status()
      if (state.account) state.account = { ...state.account, type: '影视播放时逐部核验' }
      const saved = existsSync(marker)
      if (state.status === 'idle' && !state.authenticated) state.message = saved
        ? '已保存本人爱奇艺登录；点「检查」可确认是否仍有效，影视完整观看权限在播放时逐部核验。'
        : '请登录本人爱奇艺账号；影视完整观看权限在播放时逐部核验。'
      return { ...state, hasSavedLogin: saved }
    },
    start: async () => { await prepare(); return auth.flow.start() },
    check: async () => { await prepare(); const result = await auth.flow.check(); await settle(); return result },
    import: async payload => { await prepare(); const result = await auth.flow.import(payload); await settle(); return result },
    close: () => auth.flow.close(), cancel: () => auth.flow.cancel(),
    checkAccount: () => auth.checkAccount(),
    shutdown: () => auth.shutdown(),
  }
}
