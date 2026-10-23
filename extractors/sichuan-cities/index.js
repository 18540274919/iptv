import { buildChannels, claimsRef, resolveChannel } from './api.js'

export default {
  id: 'sichuan-cities', name: '四川市州',
  description: '绵阳、泸州、遂宁、内江、达州、巴中、甘孜、阿坝共 13 路官方电视直播，免登录，归入四川。',
  capabilities: { cache: 'disk', resolve: true, epg: false, catchup: false },
  catalogVersion: 1, outputGroupName: '四川', relayProxyCompatible: true,
  defaultRefreshMinutes: 1440, refreshConfigurable: false,
  refreshDescription: '目录短缓存 30 秒；绵阳、阿坝按官网播放器复用 CDN 会话，失效时重新取址。遂宁、达州四路全代理，其余中继清单、分片直连。',
  configSchema: [],
  async fetch() {
    return { groups: [{ name: '四川', dataList: buildChannels() }], meta: { skipped: [], warnings: [] } }
  },
  claimsRef, resolve: resolveChannel,
}
