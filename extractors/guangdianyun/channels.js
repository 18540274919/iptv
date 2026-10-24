/**
 * 广电云（杭州广电云，web.guangdianyun.tv）托管的市县电视台直播。
 *
 * 频道号来自 TG 群友提供的 PHP 表，2026-10-24 逐台用官方 channelInfo / getPlayAddress 核对、
 * 拉分片并截帧看过画面。pid 是直播间 id，uin 是电视台在平台上的租户号。
 *
 * - 当时在播 73 台、停推（官方 liveStatus=0，清单 stream not found）22 台都收进目录：
 *   每轮刷新只输出 liveStatus=1 的，停推的台恢复推流后下一轮自动出现。
 * - 没收：「直播黄石」(3071) 是城市监控式慢直播；「无线淮安」(803) 只放版权占位图，
 *   淮安综合用 2778；绵竹 1933 与 3686 同一台，留 1080P 的 3686；南县融媒体中心
 *   租户(1632)下的 CCTV1、湖南卫视两间是活动直播间（标题已改成别的发布会），
 *   「中华美食」(3782) 是网络台，肥东「新闻测试」(3780)、宁安「网络直播」(2475) 是活动/测试间；
 *   另有 10 台官方回「直播间不存在 / 用户不存在」，已删除。
 * - 乐清两路在原 PHP 里名字互换了，按画面角标改正：170 是综合频道、171 是新闻频道。
 * - 台标：官方 channelInfo 只有 14 台带 logoUrl，逐张打开看过，温岭那张是二维码不用，
 *   其余 13 张写死在这里（官方 OSS，地址稳定）。别的台官方没有，留空，由内置台标库兜底。
 *
 * 台名：官方只写「新闻综合频道」这类通用名的补上市县名、去掉结尾的「频道」，官方原名记在 rawName。
 */

const OSS = 'https://static-pro.guangdianyun.tv'

const rows = [
  // 北京
  { pid: 3341, uin: 3698, province: '北京', name: '昌平综合', rawName: '昌平综合频道' },
  // 黑龙江
  { pid: 2281, uin: 1463, province: '黑龙江', name: '大庆新闻综合', rawName: '大庆广播电视台新闻综合频道' },
  { pid: 2283, uin: 1463, province: '黑龙江', name: '大庆教育', rawName: '大庆广播电视台教育频道' },
  // 辽宁
  { pid: 1066, uin: 1332, province: '辽宁', name: '金普新闻综合', rawName: '新闻综合频道' },
  { pid: 2598, uin: 1332, province: '辽宁', name: '金普生活服务', rawName: '生活服务频道' },
  // 河北
  { pid: 732, uin: 1724, province: '河北', name: '冀州综合', rawName: '冀州1',
    logo: `${OSS}/1724/program/20180929/0408cf99e5433bdee09b3b2b488ef944.png` },
  { pid: 3654, uin: 1425, province: '河北', name: '武强综合', rawName: '武强县融媒体中心综合频道' },
  // 山西
  { pid: 2125, uin: 2556, province: '山西', name: '侯马电视台', rawName: '侯马台' },
  { pid: 1203, uin: 2653, province: '山西', name: '曲沃新闻综合', rawName: '曲沃电视台新闻综合频道' },
  { pid: 2652, uin: 2268, province: '山西', name: '吕梁新闻综合', rawName: '吕梁新闻综合频道' },
  { pid: 2653, uin: 2268, province: '山西', name: '吕梁影视生活', rawName: '吕梁影视生活频道' },
  { pid: 3406, uin: 1779, province: '山西', name: '交城电视台', rawName: '交城广播电视台' },
  { pid: 3407, uin: 1723, province: '山西', name: '潞州融媒', rawName: '潞州融媒' },
  { pid: 2511, uin: 3580, province: '山西', name: '芮城综合', rawName: '芮城综合频道' },
  // 山东
  { pid: 2308, uin: 3185, province: '山东', name: '淄博新闻综合', rawName: '新闻综合频道' },
  { pid: 3492, uin: 4042, province: '山东', name: '菏泽一套', rawName: '菏泽一套' },
  { pid: 3493, uin: 4042, province: '山东', name: '菏泽二套', rawName: '菏泽二套' },
  // 安徽
  { pid: 1588, uin: 2465, province: '安徽', name: '宁国新闻综合', rawName: '新闻综合频道' },
  { pid: 3390, uin: 4180, province: '安徽', name: '宿松新闻综合', rawName: '新闻综合' },
  { pid: 3350, uin: 4104, province: '安徽', name: '桐城综合', rawName: '桐城电视信号' },
  { pid: 2851, uin: 2577, province: '安徽', name: '阜阳新闻综合', rawName: '阜阳新闻综合频道（今日阜阳）' },
  { pid: 2853, uin: 2577, province: '安徽', name: '阜阳生活', rawName: '阜阳生活频道（今日阜阳）' },
  // 河南
  { pid: 142, uin: 1081, province: '河南', name: '南阳新闻综合', rawName: '新闻综合（南阳一套）',
    logo: `${OSS}/1081/program/20180320/c70d5bd94bb01ecc07345c583f700e2c.png` },
  { pid: 295, uin: 1081, province: '河南', name: '南阳公共', rawName: '公共频道（南阳二套）',
    logo: `${OSS}/1081/program/20180321/bfb51f12cfa243d54c728b59b0c22f42.jpg` },
  { pid: 296, uin: 1081, province: '河南', name: '南阳科教', rawName: '科教频道（南阳三套）',
    logo: `${OSS}/1081/program/20180321/3371bf1380ed27407efb1248fe938f0c.jpg` },
  { pid: 3662, uin: 3616, province: '河南', name: '濮阳新闻综合', rawName: '电视直播丨濮阳新闻综合频道' },
  { pid: 3017, uin: 3616, province: '河南', name: '濮阳公共', rawName: '电视直播丨濮阳公共频道' },
  { pid: 340, uin: 1465, province: '河南', name: '鹤壁新闻综合', rawName: '鹤壁新闻综合频道',
    logo: `${OSS}/1465/program/20180423/199c10ec582aa12cd022b7104bd49fdd.jpg` },
  // 湖北
  { pid: 3061, uin: 1500, province: '湖北', name: '襄阳综合', rawName: '襄阳综合频道' },
  { pid: 2675, uin: 1500, province: '湖北', name: '襄阳经济生活', rawName: '襄阳经济生活频道' },
  { pid: 304, uin: 1487, province: '湖北', name: '随州综合', rawName: '随州综合频道',
    logo: `${OSS}/1487/program/20180320/0cd92962c37ae5bc328b40a406fa9a30.png` },
  { pid: 305, uin: 1487, province: '湖北', name: '随州农村', rawName: '随州农村频道',
    logo: `${OSS}/1487/program/20180320/c9ae814c3dd33df07215c60dc162a3a3.png` },
  { pid: 509, uin: 1832, province: '湖北', name: '仙桃综合', rawName: '综合频道' },
  { pid: 1982, uin: 3165, province: '湖北', name: '蔡甸新闻综合', rawName: '蔡甸新闻综合频道' },
  { pid: 2904, uin: 3951, province: '湖北', name: '新洲综合', rawName: '综合频道' },
  { pid: 3031, uin: 3065, province: '湖北', name: '黄石新闻综合', rawName: '新闻综合频道' },
  { pid: 3032, uin: 3065, province: '湖北', name: '黄石都市', rawName: '都市频道' },
  { pid: 3623, uin: 3065, province: '湖北', name: '黄石公共', rawName: '公共频道' },
  { pid: 1811, uin: 3179, province: '湖北', name: '恩施文旅', rawName: '恩施文旅频道' },
  { pid: 3522, uin: 3179, province: '湖北', name: '巴东综合', rawName: '巴东综合频道' },
  { pid: 3567, uin: 3179, province: '湖北', name: '咸丰综合', rawName: '咸丰综合频道' },
  { pid: 3612, uin: 1936, province: '湖北', name: '荆门新闻综合', rawName: '荆门新闻' },
  // 湖南
  { pid: 346, uin: 1648, province: '湖南', name: '长沙新闻综合', rawName: '长沙新闻综合频道' },
  { pid: 348, uin: 1648, province: '湖南', name: '长沙政法', rawName: '长沙政法频道' },
  { pid: 1788, uin: 3275, province: '湖南', name: '浏阳电视台', rawName: '浏阳电视台' },
  { pid: 1699, uin: 2193, province: '湖南', name: '岳阳新闻综合', rawName: '岳阳新闻频道' },
  { pid: 1701, uin: 2193, province: '湖南', name: '岳阳文旅都市', rawName: '岳阳文旅都市频道' },
  { pid: 2053, uin: 1366, province: '湖南', name: '株洲新闻综合', rawName: '电视新闻综合频道' },
  { pid: 1724, uin: 1632, province: '湖南', name: '南县新闻', rawName: '南县新闻频道' },
  { pid: 3088, uin: 4100, province: '湖南', name: '宜章新闻综合', rawName: '宜章新闻综合频道' },
  // 江西
  { pid: 2574, uin: 3313, province: '江西', name: '鹰潭新闻综合', rawName: '电视新闻综合频道' },
  // 江苏
  { pid: 2778, uin: 1610, province: '江苏', name: '淮安综合', rawName: '综合频道' },
  { pid: 3177, uin: 1812, province: '江苏', name: '新沂综合', rawName: '新沂融媒-综合频道' },
  // 浙江
  { pid: 1181, uin: 1482, province: '浙江', name: '富阳新闻综合', rawName: '富阳电视台新闻综合频道' },
  { pid: 2513, uin: 3767, province: '浙江', name: '临平新闻', rawName: '临平新闻直播' },
  { pid: 187, uin: 1176, province: '浙江', name: '建德综合', rawName: '建德电视台综合频道',
    logo: `${OSS}/1176/program/20171220/4e5c424ebc401c6b3cc23f5b112d15de.jpg` },
  { pid: 170, uin: 1356, province: '浙江', name: '乐清综合', rawName: 'YQTV-1' },
  { pid: 171, uin: 1356, province: '浙江', name: '乐清新闻', rawName: 'YQTV' },
  { pid: 1335, uin: 2768, province: '浙江', name: '永嘉新闻综合', rawName: '永嘉电视台新闻综合频道' },
  { pid: 911, uin: 1639, province: '浙江', name: '温岭新闻综合', rawName: '温岭广播电视台新闻综合频道 正在直播' },
  { pid: 1287, uin: 1639, province: '浙江', name: '温岭民生休闲', rawName: '温岭广播电视台民生休闲频道 正在直播' },
  { pid: 1603, uin: 2515, province: '浙江', name: '仙居新闻综合', rawName: '仙居新闻综合' },
  { pid: 1361, uin: 2840, province: '浙江', name: '新昌新闻', rawName: '新闻频道' },
  { pid: 1362, uin: 2840, province: '浙江', name: '新昌生活', rawName: '生活频道' },
  { pid: 1423, uin: 1329, province: '浙江', name: '宁海新闻综合', rawName: '宁海新闻综合频道' },
  { pid: 3152, uin: 3512, province: '浙江', name: '奉化新闻综合', rawName: '新闻综合频道' },
  { pid: 1499, uin: 1253, province: '浙江', name: '安吉新闻综合', rawName: '新闻综合频道' },
  { pid: 3711, uin: 4099, province: '浙江', name: '金华新闻综合', rawName: '新闻综合频道直播（勿删）' },
  { pid: 1796, uin: 3071, province: '浙江', name: '义乌新闻', rawName: '新闻频道' },
  { pid: 2133, uin: 3071, province: '浙江', name: '义乌商贸', rawName: '商贸频道' },
  { pid: 3090, uin: 3071, province: '浙江', name: '义乌文艺', rawName: '文艺频道' },
  { pid: 1511, uin: 1043, province: '浙江', name: '桐乡新闻综合', rawName: '桐乡新闻综合频道' },
  // 福建
  { pid: 699, uin: 1945, province: '福建', name: '福清综合', rawName: '福清电视台综合频道',
    logo: `${OSS}/1945/program/20190107/c8d5b6c037b52d4b0f7a6d903ea967b5.png` },
  { pid: 2068, uin: 2656, province: '福建', name: '闽侯综合', rawName: '闽侯电视台综合频道' },
  { pid: 907, uin: 1118, province: '福建', name: '平潭新闻综合', rawName: '平潭新闻综合',
    logo: `${OSS}/1118/program/20181222/8096d6afba6530dcc6bdb248abed4d53.jpeg` },
  { pid: 908, uin: 1118, province: '福建', name: '平潭旅游文化', rawName: '平潭旅游文化',
    logo: `${OSS}/1118/program/20181222/1bdace79bf9b193d5462b76d351b2911.jpeg` },
  { pid: 2597, uin: 3454, province: '福建', name: '永安综合', rawName: '永安综合' },
  { pid: 425, uin: 1567, province: '福建', name: '沙县综合', rawName: '沙县综合' },
  { pid: 765, uin: 2055, province: '福建', name: '尤溪综合', rawName: '尤溪综合频道' },
  { pid: 2333, uin: 3708, province: '福建', name: '泉港一套', rawName: '泉港一套' },
  { pid: 1792, uin: 2311, province: '福建', name: '永春综合', rawName: '永春频道直播' },
  { pid: 3102, uin: 4113, province: '福建', name: '集美综合', rawName: '集美综合频道' },
  // 广东
  { pid: 643, uin: 1629, province: '广东', name: '信宜综合', rawName: '信宜综合',
    logo: `${OSS}/1629/program/20190102/97774048f4467a1736149e6220e0af78.jpeg` },
  // 广西
  { pid: 1902, uin: 3370, province: '广西', name: '柳州新闻综合', rawName: '柳州新闻综合频道' },
  { pid: 1808, uin: 3370, province: '广西', name: '柳州科教', rawName: '柳州科教频道' },
  { pid: 3289, uin: 4042, province: '广西', name: '玉林新闻综合', rawName: 'ylzh' },
  // 贵州
  { pid: 3043, uin: 4088, province: '贵州', name: '印江电视台', rawName: '印江电视台直播' },
  // 四川
  { pid: 1670, uin: 1822, province: '四川', name: '南江电视台', rawName: '电视直播' },
  { pid: 3686, uin: 3277, province: '四川', name: '绵竹电视台', rawName: '绵竹电视直播信号-备线' },
  { pid: 391, uin: 1743, province: '四川', name: '射洪综合', rawName: '射洪综合',
    logo: `${OSS}/1743/program/20180516/ce4811feb929758b2d46329fc6d59d56.png` },
  // 新疆
  { pid: 2229, uin: 3643, province: '新疆', name: '阿克苏汉语综合', rawName: '汉语综合频道' },
  { pid: 2233, uin: 3643, province: '新疆', name: '阿克苏维语综合', rawName: '维吾尔语综合频道' },
  { pid: 2234, uin: 3643, province: '新疆', name: '阿克苏党员教育', rawName: '党员远程教育频道' },
  { pid: 3377, uin: 4239, province: '新疆', name: '布尔津哈萨克语', rawName: '布尔津县哈萨克语频道' },
  // 海南
  { pid: 1330, uin: 1669, province: '海南', name: '儋州电视台', rawName: '儋州台' },
]

export const CHANNELS = Object.freeze(rows.map(row => Object.freeze({
  ...row,
  key: `${row.pid}-${row.uin}`,
  ref: `gdy-${row.pid}-${row.uin}`,
})))

export const CHANNEL_BY_REF = new Map(CHANNELS.map(row => [row.ref, row]))
export const CHANNEL_BY_KEY = new Map(CHANNELS.map(row => [row.key, row]))

/** 输出时省份分组的先后：按频道表里第一次出现的顺序 */
export const PROVINCES = [...new Set(CHANNELS.map(row => row.province))]
