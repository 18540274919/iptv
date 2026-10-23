/** 2026-10-23 逐路核对官方目录、分片与实际画面；只收正式电视频道。 */
const nmip = (host, id) => `https://${host}/nmip-media/channellive/channel${id}/playlist.m3u8`
const dzLogo = (folder, file) => `https://file.dzrm.cn/cms/2023-12-13/${folder}/${file}.png`

const rows = [
  { id: 'mytv1', city: '绵阳', name: '绵阳新闻综合', kind: 'html',
    page: 'http://www.myntv.cn/html/zb/mytv1.asp',
    media: 'http://fjgcl.myxwcm.cn/live/9ff5a9b001971000b986a10c00000000/playlist.m3u8', logo: 'http://www.myntv.cn/theme/v2019/images/LOGO.png?v=1.2' },
  { id: 'lztv1', city: '泸州', name: '泸州新闻综合', kind: 'html',
    page: 'https://www.luzhoubs.com/lztv1/index.html', media: nmip('m3u8channel.luzhoubs.com', 106011),
    logo: 'https://www.luzhoubs.com/theme/202006/images/2020logo.png' },
  { id: 'lztv3', city: '泸州', name: '泸州科教生活', kind: 'html',
    page: 'https://www.luzhoubs.com/lztv3/index.html', media: nmip('m3u8channel.luzhoubs.com', 103074),
    logo: 'https://www.luzhoubs.com/theme/202006/images/2020logo.png' },
  { id: 'sntv1', city: '遂宁', name: '遂宁综合', kind: 'html', page: 'https://www.snxw.com/',
    media: 'https://szyplaytv.snxw.com/live/xwzh/playlist.m3u8',
    logo: 'https://app-public.snxw.com/suinMini/site/static/suining_web/statics/images/logo.png' },
  { id: 'njtv1', city: '内江', name: '内江综合', kind: 'neijiang',
    page: 'https://xmt.njrbs.cn/bencandy.php?fid=43&id=972',
    media: 'https://njzb.scnj.tv/hls_njtv_direct/1.m3u8',
    logo: 'https://xmt.njrbs.cn/images/njtvtextlogo.png' },
  { id: 'dztv1', city: '达州', name: '达州新闻综合', kind: 'nmip', contentId: '13560916',
    page: 'https://www.dzrm.cn/cms/tv/13560916', media: nmip('m3u8channel.dzrm.cn', 104234),
    logo: dzLogo('72003021', 'E149F34CBCC393807B3EC28073D98F00') },
  { id: 'dztv2', city: '达州', name: '达州文化生活', kind: 'nmip', contentId: '13560089',
    page: 'https://www.dzrm.cn/cms/tv/13560089', media: nmip('m3u8channel.dzrm.cn', 104727),
    logo: dzLogo('72003045', '89786946037CED05920CDE1DD20E5BE7') },
  { id: 'tctv', city: '达州', name: '达州通川', kind: 'nmip', contentId: '13559838',
    page: 'https://www.dzrm.cn/cms/tv/13559838', media: nmip('m3u8channel.dzrm.cn', 105011),
    logo: dzLogo('72003121', 'E6F2BA26BEF4F6159A9F41627B3AA3AD') },
  { id: 'bztv1', city: '巴中', name: '巴中综合', kind: 'bazhong', contentId: '6725',
    page: 'https://www.bzgd.com/1902/index', media: 'https://livetv.bzitv.cn/live/260315BZTVlive1001/hls.m3u8',
    logo: 'https://www.bzgd.com/sctv/405/image/public/201910/20191019163535_orxlel1jkn.png' },
  { id: 'bztv2', city: '巴中', name: '巴中文旅生活', kind: 'bazhong', contentId: '6726',
    page: 'https://www.bzgd.com/1902/index', media: 'https://livetv.bzitv.cn/live/260613BZTVlive1002/hls.m3u8',
    logo: 'https://www.bzgd.com/sctv/405/image/public/202205/20220512155532_pqq5revkao.jpg' },
  { id: 'gztv1', city: '甘孜', name: '甘孜综合', kind: 'nmip', contentId: '1027139',
    page: 'https://www.ganzitv.com/cms/tv/1027139', media: nmip('m3u8channel.ganzitv.com', 1),
    logo: 'https://alifile.ganzitv.com/general/2024-12-20/40138038D0A9E88B36450F14C3048F0D.png' },
  { id: 'abtv1', city: '阿坝', name: '阿坝新闻综合', kind: 'aba', contentId: '1523946498072231937',
    page: 'https://www.aba-news.com.cn/',
    media: 'https://apppull.aba-news.com.cn/live/be5325350190100009f6751d00000000/playlist.m3u8',
    logo: 'https://rmt.aba-news.com.cn/file/c3200/2022/05/10/73ef6821-ff27-47b9-8d32-eda40848f4cf_one.jpg' },
  { id: 'abtv2', city: '阿坝', name: '阿坝藏语综合', kind: 'aba', contentId: '1504727504570355714',
    page: 'https://www.aba-news.com.cn/',
    media: 'https://apppull.aba-news.com.cn/live/be57fb5401901000b611a82100000000/playlist.m3u8',
    logo: 'https://rmt.aba-news.com.cn/file/c3200/2022/05/09/7c8e1b4d-3e0e-440d-b688-fd6564f1250c_one.jpg' },
]

// 独立频道图优先；没有频道图的使用所属广电/融媒的官方标识，出处另记 README 与内置包。
// 绵阳公共、科技与遂宁官网注释掉的旧文化生活源不收录；眉山当前电视/广播目录只有广播。
export const CHANNELS = Object.freeze(rows.map(row => Object.freeze({ ...row, ref: `sichuan-cities-${row.id}` })))
export const CHANNEL_BY_REF = new Map(CHANNELS.map(row => [row.ref, row]))
