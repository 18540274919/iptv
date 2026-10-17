import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import path from 'node:path'
import { runtimeDir } from './paths.js'
import { samples, registerCatalogSample, registerHistorySample } from './scripts/samples.mjs'
const file = path.join(runtimeDir, 'videos.json')
let serial = Promise.resolve()
export async function restoreSamples() {
  try {
    const data = await readFile(file)
    if (data.length > 2 * 1024 * 1024) throw Error('Invalid video registry')
    const rows = JSON.parse(data)
    if (!Array.isArray(rows) || rows.length > 1000) throw Error('Invalid video registry')
    for (const row of rows) {
      if (typeof row.title !== 'string' || row.title.length > 500) continue
      try {
        if (row.id.startsWith('history-')) registerHistorySample({ ...row, supported: true, duration: row.expectedSeconds })
        else if (row.id.startsWith('catalog-')) registerCatalogSample({ ...row, episodeSeconds: row.expectedSeconds })
      } catch { /* Bad persisted rows never become arbitrary playback URLs. */ }
    }
  } catch (error) { if (error.code !== 'ENOENT') throw Error('影视本机索引无法读取；现有登录态保留') }
}
export function saveSamples() {
  const data = JSON.stringify(samples)
  serial = serial.catch(() => {}).then(async () => {
    await mkdir(runtimeDir, { recursive: true, mode: 0o700 })
    await writeFile(file + '.tmp', data, { mode: 0o600 })
    await rename(file + '.tmp', file)
  })
  return serial
}
