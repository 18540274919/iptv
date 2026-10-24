/** 广电云市县台：全国 20 个省区市的市县级融媒体中心 / 电视台官方直播按省归组，各地慢直播放「慢直播」分组。 */
import { CHANNELS, CHANNEL_BY_REF, GROUPS } from './channels.js'
import { checkLive, createResolver } from './api.js'
import epg from './epg.js'
import { printGrey } from '../../utils/colorOut.js'

const resolver = createResolver({ log: printGrey })

export function buildGroups(results) {
  const live = results.filter(item => item.state === 'live' || item.state === 'unknown').map(item => item.channel)
  return GROUPS
    .map(group => ({
      name: group,
      dataList: live.filter(channel => channel.group === group).map(channel => ({
        name: channel.name,
        deferredRef: channel.ref,
        // 清单由模块每次播放请求取回（顺带给在线会话续期）并交给本机中继；分片带自己的签名，播放器直连
        relayHls: true,
        logo: channel.logo || '',
        catchup: 'none',
        opts: ['network-caching=3000'],
      })),
    }))
    .filter(group => group.dataList.length)
}

export default {
  id: 'guangdianyun',
  name: '市县台',
  description: '广电云平台托管的市县级电视台官方直播，覆盖 20 个省区市、按省归组，另有各地融媒体中心的慢直播放在「慢直播」分组；每轮只收正在推流的，停推的恢复后自动出现。',
  capabilities: { cache: 'disk', resolve: true, epg: true, catchup: false },
  catalogVersion: 3,
  relayProxyCompatible: true,
  defaultRefreshMinutes: 60,
  refreshConfigurable: false,
  refreshDescription: '每小时查一次各台是否在推流，只收正在推流的。播放时在官方平台挂一个在线会话取地址，没人看一分半后自动断开；清单经本机中继，分片直连官方 CDN。',
  configSchema: [],
  epg,

  async fetch(config, ctx = {}) {
    const results = await checkLive(CHANNELS, { timeoutMs: ctx.timeoutMs, fetchImpl: ctx.fetchImpl })
    const unknown = results.filter(item => item.state === 'unknown')
    if (unknown.length === results.length) throw new Error(unknown[0]?.error || '广电云频道状态查询失败')
    const offline = results.filter(item => item.state !== 'live' && item.state !== 'unknown')
    const skipped = offline.map(item => `${item.channel.name}：${item.state === 'gone' ? '直播间已不存在' : '台方当前没有推流'}`)
    const warnings = unknown.length
      ? [`${unknown.length} 台状态没查到，先照常保留：${unknown.slice(0, 5).map(item => item.channel.name).join('、')}`]
      : []
    return { groups: buildGroups(results), meta: { skipped, warnings } }
  },

  claimsRef: ref => CHANNEL_BY_REF.has(String(ref || '')),
  resolve: ref => resolver.resolve(ref),
  clearResolveCache: () => resolver.clear(),
  async shutdown() { resolver.clear() },
}
