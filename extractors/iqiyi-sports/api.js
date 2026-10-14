import { fetch, ProxyAgent } from 'undici'
export const CONFIG_URL = 'https://sports.iqiyi.com/resource/json/pc/config/iqiyiPcConfig.json'
export const GROUP_NAME = '爱奇艺体育'
const dispatcher = process.env.IQIYI_HTTP_PROXY ? new ProxyAgent(process.env.IQIYI_HTTP_PROXY) : undefined
export const officialFetch = (url, options = {}) => fetch(url, { ...options, dispatcher })
export const claimsRef = ref => /^iqiyi-sports-[1-9]\d{0,19}$/.test(String(ref || ''))
export const eventName = event => `爱奇艺体育 · ${event.title}`
export function normalizeEvents(body) {
  if (String(body?.resCode) !== '200' || !Array.isArray(body.retData)) throw new Error('爱奇艺官方赛事目录格式变化')
  const result = [], seen = new Set()
  for (const section of body.retData) for (const row of section.list || []) {
    const match = row.matchBaseInfo, page = row.jumpInfo?.iqiyiPC
    if (String(match?.status) !== '1' || !/^[1-9]\d{0,19}$/.test(String(match.matchId))
        || !/^https:\/\/sports\.iqiyi\.com\/resource\/pcw\/live\/[a-z0-9]+$/.test(page || '')
        || !match.title || /宗教|佛教|基督|福音|讲经/.test(match.title) || seen.has(String(match.matchId))) continue
    seen.add(String(match.matchId))
    result.push({ id: String(match.matchId), title: String(match.title).replace(/[\r\n]/g, ' '), officialPage: page,
      qipuId: String(match.qipuid || ''), free: String(match.isFree) === '1', startTime: match.matchRoomStartTime })
  }
  return result
}
export function createCatalog({ fetchImpl = officialFetch, now = Date.now } = {}) {
  let cache, task
  async function json(url) {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error(`爱奇艺目录请求失败：HTTP ${response.status}`)
    return response.json()
  }
  return {
    async discover() {
      if (cache && now() - cache.at < 60000) return cache
      if (task) return task
      task = (async () => {
        const config = await json(CONFIG_URL)
        const menus = config.retData?.menuConfigList?.filter(m => /^https:\/\/sports\.iqiyi\.com\/resource\/json\/pc\/channel\/menu_\d+\.json$/.test(m.url)) || []
        if (!menus.length) throw new Error('爱奇艺官方菜单配置为空')
        const responses = await Promise.allSettled(menus.map(m => json(m.url).then(normalizeEvents)))
        const good = responses.filter(r => r.status === 'fulfilled')
        if (!good.length) throw new Error('爱奇艺赛事目录全部读取失败，保留上次频道')
        const byId = new Map()
        for (const r of good) for (const event of r.value) if (!byId.has(event.id)) byId.set(event.id, event)
        cache = { at: now(), events: [...byId.values()], warnings: good.length < responses.length ? ['部分爱奇艺官方赛事菜单读取失败'] : [] }
        return cache
      })()
      try { return await task } finally { task = undefined }
    },
    clear() { cache = undefined },
  }
}
export function selectAuthorizedStream(data, hasLogin) {
  const preview = data?.bossRet
  if (preview?.data?.prv === '1' || Number(preview?.previewTime) > 0) {
    throw Object.assign(new Error('此赛事仅获试看授权，请登录或确认本人体育会员/赛事权益'), { credential: true })
  }
  const member = hasLogin && preview?.code === 'A00000' && preview?.data?.prv === '0'
  if (!member && Number(data?.boss) !== 0) throw Object.assign(new Error('此赛事没有完整播放授权，请检查本人账号及赛事权益'), { credential: true })
  if (data?.program?.liveDrmInfo?.drm) throw new Error('此赛事需要官方 DRM 播放器，普通 M3U 无法播放')
  const stream = data?.streams?.filter(s => s.formatType === 'TS' && s.codeFormat === 2 && s.url)
    .sort((a, b) => Number(b.bitrate) - Number(a.bitrate))[0]
  if (!stream) throw new Error('官方未提供可用的 H.264 HLS')
  validateMediaUrl(stream.url)
  return { url: stream.url, size: stream.screenSize, bid: stream.bid, member }
}
export function validateMediaUrl(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port
      || !/(^|\.)(iqiyi\.com|71edge\.com)$/.test(url.hostname)) throw new Error('媒体地址不在已验证的爱奇艺官方 CDN 内')
  return url.href
}
export function checkManifest(text) {
  if (!text.trimStart().startsWith('#EXTM3U') || text.length > 1000000) throw new Error('官方未返回有效 HLS 清单')
  if ([...text.matchAll(/#EXT-X-(?:SESSION-)?KEY:METHOD=([^,\r\n]+)/g)].some(m => m[1] !== 'NONE')) throw new Error('此赛事 HLS 加密，请使用官方播放器')
  return text
}
