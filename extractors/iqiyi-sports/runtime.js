import { createCatalog, officialFetch, selectAuthorizedMedia, checkManifest, validateMediaUrl, claimsRef } from './api.js'
import { createBrowserAuth } from './auth.js'

export function createRuntime({ catalog = createCatalog(), auth, fetchImpl = officialFetch, now = Date.now } = {}) {
  auth ||= createBrowserAuth({ getEvent: async () => {
    // Free rooms prove nothing about the account; only member rooms can verify login.
    const { events, vods = [] } = await catalog.discover()
    return events.find(e => !e.free) || vods.find(e => !e.free)
  } })
  const tickets = new Map(), pending = new Map()
  let rejected = '', revision = auth.revision(), capturing = false
  const clear = () => tickets.clear()
  // Re-check authorization off the manifest path: a browser capture takes seconds and
  // would stall players if it ran inside a manifest poll. Hard expiry stays at four minutes.
  function renewSoon(event, cached) {
    cached.renewAt = now() + 30000
    ticket(event, true).catch(error => {
      if (!error.credential) return
      rejected = error.message
      if (tickets.get(event.id) === cached) tickets.delete(event.id)
    })
  }
  async function ticket(event, force = false) {
    if (auth.revision() !== revision) { clear(); revision = auth.revision(); rejected = '' }
    const cached = tickets.get(event.id)
    if (!force && cached?.expiresAt > now()) {
      if (cached.renewAt <= now() && !pending.has(event.id) && !capturing) renewSoon(event, cached)
      return cached
    }
    if (pending.has(event.id)) return pending.get(event.id)
    if (capturing) throw new Error('正在解析另一场爱奇艺赛事，请稍后播放')
    capturing = true
    const task = (async () => {
      const captured = await auth.capture(event)
      const result = selectAuthorizedMedia(captured, event)
      if (!event.kind && captured.data.id && event.qipuId && String(captured.data.id) !== event.qipuId) throw new Error('官方播放房间与目录不一致，请刷新赛事目录')
      const value = { ...result, expiresAt: now() + 240000, renewAt: now() + 150000, referer: event.officialPage }
      tickets.set(event.id, value); rejected = ''
      return value
    })()
    pending.set(event.id, task)
    try { return await task } finally { pending.delete(event.id); capturing = false }
  }
  async function manifest(result) {
    if (result.manifestText) return { text: checkManifest(result.manifestText), url: result.referer }
    const response = await fetchImpl(result.url, { headers: { Referer: result.referer, 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw Object.assign(new Error(`官方节目清单返回 HTTP ${response.status}`), { renew: [401, 403, 404, 410].includes(response.status) })
    const url = validateMediaUrl(response.url || result.url)
    const text = checkManifest(await response.text())
    return { text, url }
  }
  return {
    catalog,
    clear,
    credentialRejected: () => rejected || (auth.flow.status().status === 'error' ? auth.flow.status().message : ''),
    browserLoginFlow: Object.fromEntries(['status', 'start', 'check', 'import', 'cancel', 'close'].map(method => [method, async (...args) => {
      const result = await auth.flow[method](...args)
      if (result.authenticated && result.entitled !== false) rejected = ''
      return result
    }])),
    async resolve(ref) {
      if (!claimsRef(ref)) return { url: '', desc: '未知的爱奇艺体育赛事引用' }
      try {
        const id = ref.slice('iqiyi-sports-'.length)
        // Manifest polls take the cached catalog and refresh it in the background; only
        // an event missing from the cached copy waits for a fresh scan.
        const find = data => [...data.events, ...(data.vods || [])].find(e => e.id === id)
        let event = find(await catalog.discover({ allowStale: true }))
        if (!event) event = find(await catalog.discover())
        if (!event) return { url: '', desc: '此内容已结束或不在官方直播及点播目录中' }
        let result = await ticket(event), hls
        try { hls = await manifest(result) }
        catch (error) {
          if (!error.renew) throw error
          tickets.delete(event.id); result = await ticket(event); hls = await manifest(result)
        }
        return { url: result.url, desc: `${event.title} · ${result.size}${!event.kind && result.bid === 610 ? ' · 50帧档' : ''}`,
          manifestText: hls.text, manifestUrl: hls.url,
          upstreamHeaders: target => { validateMediaUrl(target); return { Referer: event.officialPage, 'User-Agent': 'Mozilla/5.0' } },
          upstreamUrlTransform: validateMediaUrl }
      } catch (error) {
        if (error.credential) rejected = error.message
        return { url: '', desc: String(error.message).replace(/https?:\/\/\S+/g, '[官方地址]') }
      }
    },
    async shutdown() { clear(); await auth.shutdown() },
  }
}
export const runtime = createRuntime()
