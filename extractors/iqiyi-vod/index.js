import { createVODService } from './scripts/server.mjs'
let pending
export const service = () => pending ||= createVODService()
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
  description: '官方首页推荐、最热、最新、观看历史与电视剧选集；完整观看权限逐条核验，按需播放和自动续期，支持统一弹幕接口。请打开影视浏览页，生成专用 M3U 供播放器订阅。',
  capabilities: { cache: 'memory', resolve: false, epg: false, catchup: false },
  defaultRefreshMinutes: 5, refreshConfigurable: false,
  refreshDescription: '影视目录与观看历史在浏览页按需读取；不在后台批量打开全部视频。只有已确认完整权限的内容才进入专用 M3U，清单与分片均重新检查授权有效期。',
  configSchema: [],
  // VOD albums and account history are not fixed IPTV channels. Their dedicated
  // playlist is generated at request time, not written into the static TV list.
  async fetch() { return { groups: [], meta: { skipped: [], warnings: [] } } },
  async shutdown() { if (pending) await (await pending).close() },
}
