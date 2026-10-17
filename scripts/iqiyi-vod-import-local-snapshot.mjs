// One-time, local migration. Explicit source only; existing target credentials
// are never overwritten and the source profile is never launched or modified.
import { readFile, mkdir, writeFile, access, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { runtimeDir } from '../extractors/iqiyi-vod/paths.js'
import { cloneProfile } from '../extractors/iqiyi-vod/profile.js'
const sourceArg = process.argv[process.argv.indexOf('--source') + 1]
if (!process.argv.includes('--source') || !sourceArg) throw Error('Usage: node scripts/iqiyi-vod-import-local-snapshot.mjs --source /private/path/snapshot-path.txt [--progress /private/path/history-progress.json]')
const source = path.resolve(sourceArg.endsWith('.txt') ? (await readFile(sourceArg, 'utf8')).trim() : sourceArg)
const target = path.join(runtimeDir, 'profile')
try { await access(path.join(runtimeDir, 'snapshot-path.txt')); throw Error('目标已有影视登录态，已保留；未覆盖任何 Cookie') }
catch (error) { if (error.code !== 'ENOENT') throw error }
await cloneProfile(source, target)
await mkdir(runtimeDir, { recursive: true, mode: 0o700 })
await writeFile(path.join(runtimeDir, 'snapshot-path.txt'), target, { mode: 0o600, flag: 'wx' })
if (process.argv.includes('--progress')) {
  const file = process.argv[process.argv.indexOf('--progress') + 1]
  const data = await readFile(file); if (data.length > 5 * 1024 * 1024) throw Error('本机进度文件过大')
  JSON.parse(data)
  await writeFile(path.join(runtimeDir, 'history-progress.json'), data, { mode: 0o600, flag: 'wx' })
}
console.log('已创建 IPTV 影视模块的私有登录副本；源登录态与 Cookie 未修改。')
