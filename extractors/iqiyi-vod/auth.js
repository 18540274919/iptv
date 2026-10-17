import path from 'node:path'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { createBrowserAuth } from '../iqiyi-sports/auth.js'
import { runtimeDir } from './paths.js'
export function createVODAuth() {
  const profile = path.join(runtimeDir, 'profile')
  const auth = createBrowserAuth({ profile, accountOnly: true, getEvent: async () => undefined })
  async function prepare() {
    await mkdir(runtimeDir, { recursive: true, mode: 0o700 })
    await mkdir(profile, { recursive: true, mode: 0o700 })
    await writeFile(path.join(runtimeDir, 'snapshot-path.txt'), profile, { mode: 0o600 })
  }
  return {
    status: () => {
      const state = auth.flow.status()
      if (state.account) state.account = { ...state.account, type: '影视播放时逐部核验' }
      if (state.status === 'idle' && !state.authenticated) state.message = '请登录本人爱奇艺账号；影视完整观看权限在播放时逐部核验。'
      return { ...state, hasSavedLogin: existsSync(path.join(runtimeDir, 'snapshot-path.txt')) }
    },
    start: async () => { await prepare(); return auth.flow.start() },
    check: async () => { await prepare(); return auth.flow.check() },
    import: async payload => { await prepare(); return auth.flow.import(payload) },
    close: () => auth.flow.close(), cancel: () => auth.flow.cancel(),
  }
}
