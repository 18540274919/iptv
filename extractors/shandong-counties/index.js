/** 山东市县台：闪电新闻融媒平台上 16 个地市的区县融媒体中心、市台官方直播，并进「山东」分组。 */
import { CHANNELS } from './channels.js'
import { checkChannels } from './api.js'
import epg from './epg.js'

export function buildGroups(results) {
  return [{
    name: '山东',
    dataList: results.filter(item => item.state === 'live').map(item => ({
      name: item.channel.name,
      url: item.stream,
      logo: item.logo || '',
      catchup: 'none',
      opts: ['network-caching=3000'],
    })),
  }]
}

export default {
  id: 'shandong-counties',
  name: '山东市县',
  description: '闪电新闻融媒平台上山东 16 个地市的区县融媒体中心与部分市台官方直播，并进山东分组；每轮只收正在推流的台。',
  capabilities: { cache: 'disk', resolve: false, epg: true, catchup: false },
  catalogVersion: 1,
  outputGroupName: '山东',
  defaultRefreshMinutes: 120,
  refreshConfigurable: false,
  refreshDescription: '每两小时向官方接口取一次各台地址，并逐台确认主清单在推流，只收取得到的；地址交给播放器直连官方 CDN，本机不转发媒体。',
  configSchema: [],
  epg,

  async fetch(config, ctx = {}) {
    const results = await checkChannels(CHANNELS, { timeoutMs: ctx.timeoutMs, fetchImpl: ctx.fetchImpl })
    const unknown = results.filter(item => item.state === 'unknown')
    if (unknown.length === results.length) throw new Error(unknown[0]?.error || '闪电新闻接口请求失败')
    const reasons = { offline: '台方当前没有推流', gone: '官方已不再列出这台' }
    const skipped = results.filter(item => reasons[item.state]).map(item => `${item.channel.name}：${reasons[item.state]}`)
    const warnings = unknown.length
      ? [`${unknown.length} 台所在机构的接口没取到，本轮暂缺：${unknown.slice(0, 5).map(item => item.channel.name).join('、')}`]
      : []
    return { groups: buildGroups(results), meta: { skipped, warnings } }
  },
}
