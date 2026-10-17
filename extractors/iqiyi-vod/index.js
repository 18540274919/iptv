import { createVODService } from './scripts/server.mjs'
let pending, live, watcher
// A failed start (e.g. unreadable videos.json) must not be cached forever, or every request
// would answer 503 until a restart that does not help either.
export const service = () => pending ||= createVODService().then(value => { live = value; watch(); return value },
  error => { pending = undefined; throw error })
async function moduleEnabled() {
  const { getExtractorManager } = await import('../../utils/extractorManager.js')
  return getExtractorManager().isModuleEnabled({ id: 'iqiyi-vod' })
}
// Switching the module off is the advertised way to stop its browser work, so stop the running
// service (exports, renewals, workers) instead of only answering 404 to new requests.
function watch() {
  if (watcher) return
  watcher = setInterval(async () => {
    if (!live || await moduleEnabled().catch(() => true)) return
    const current = pending
    pending = undefined; live = undefined
    clearInterval(watcher); watcher = undefined
    await (await current)?.close().catch(() => {})
  }, 30000)
  watcher.unref?.()
}
export const VOD_PREFIX = '/iqiyi-vod'
export async function handleVODRequest(req, res, { routePath, origin, accessPrefix = '', admin = false, enabled = true } = {}) {
  if (routePath !== VOD_PREFIX && !routePath?.startsWith(VOD_PREFIX + '/')) return false
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  if (!enabled) { res.writeHead(404); res.end('爱奇艺影视模块未启用'); return true }
  if (routePath === VOD_PREFIX) { res.writeHead(307, { Location: accessPrefix + VOD_PREFIX + '/' }); res.end(); return true }
  const query = String(req.url || '').includes('?') ? String(req.url).slice(String(req.url).indexOf('?')) : ''
  await (await service()).handle(req, res, { path: routePath.slice(VOD_PREFIX.length) + query, origin, prefix: accessPrefix + VOD_PREFIX, admin })
  return true
}
export default {
  id: 'iqiyi-vod', name: '爱奇艺影视', category: 'live', helper: 'iqiyi-vod',
  description: '官方首页推荐、最热、最新、观看历史与电视剧选集；完整观看权限逐条核验，按需播放和自动续期，支持统一弹幕接口。请打开影视浏览页，生成专用 M3U 供播放器订阅（仅管理员）。没人打开浏览页或播放时，后台不运行浏览器。',
  capabilities: { cache: 'memory', resolve: false, epg: false, catchup: false },
  // Never publishes fixed channels: content lives on its own browse page and playlist.
  channelless: true,
  defaultRefreshMinutes: 1440, refreshConfigurable: false,
  refreshDescription: '影视目录与观看历史在浏览页按需读取，不在后台定时抓取。专用 M3U 只列已确认完整观看权限的内容；每轮最多新核验 20 部，播放器拉清单最多每 2 小时触发一轮。',
  configSchema: [],
  // VOD albums and account history are not fixed IPTV channels. Their dedicated
  // playlist is generated at request time, not written into the static TV list.
  async fetch() { return { groups: [], meta: { skipped: [], warnings: [] } } },
  credentialRejected: () => live?.credentialRejected() || '',
  async shutdown() { clearInterval(watcher); if (pending) await (await pending).close() },
}
