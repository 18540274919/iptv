# 四川市州官方 App 追查（2026-10-23）

继续排查首轮未接入的 12 个市州，从官方站点的客户端下载链接、应用商店登记的开发者/支持网站、公开播放器和官方安装包静态资源取证。未使用社区 IPTV 列表，未绕过登录、加固、证书校验或访问拒绝。App 包和含短签名的原始调查文件只留在实验台，不进入项目。

## 已新增：7 个市州、9 路

| 市州 / 官方客户端 | 接入频道 | 公开取址入口 | 本轮解码 |
| --- | --- | --- | --- |
| 广元 / [广元手机台](https://m.dzsm.com/cms/download) | 广元新闻综合 | `api.dzsm.com/cms/public/v2/contents/1006352`，按 `live_id=100999` 请求 `components` | H.264/AAC，1280×720 |
| 宜宾 / [宜人宜宾](https://m.yibinrm.cn/cms/download) | 宜宾新闻综合、宜宾科教文旅 | `m.yibinrm.cn/v2/cms/public/v2/contents/{43174882,43174964}`，使用播放器指定的 `fields.link_url` | 两路 H.264/AAC，1920×1080 |
| 凉山 / [云上凉山](https://m.i0834.cn/) | 凉山新闻综合、凉山彝语综合 | `m.i0834.cn/v2/cms/public/v2/contents/{1052185,1056318}`，按组件 ID 114103 / 115044 请求 `components` | 两路 H.264/AAC，720×404 |
| 雅安 / [云小雅](https://m.yunxya.com/) | 雅安新闻综合 | 从应用商店开发者登记的隐私政策找到现用域名，`v2/cms/public/v2/contents/1030244` 的 `fields.link_url` | H.264/AAC，1920×1080 |
| 乐山 / [乐水乐山](https://www.leshan.cn/) | 乐山新闻综合 | 官网客户端下载二维码 → 租户 a1100 → 当前 App 首页「看电视」节点 1817400274017325058 | H.264/AAC，1920×1080 |
| 眉山 / [眉说之言](https://mszy.scmstv.cn/) | 眉山综合 | 租户 m1400 的 App 首页 →「看电视」→「眉山综合」节点 1867459318922403842 | H.264/AAC，1280×720 |
| 资阳 / [资阳观察](https://appmgr.zyrb.com.cn/public/html/app/download.html) | 资阳新闻综合 | [官网电视页](https://www.zyrb.com.cn/#/bD074b747F?pkey=eb00c31e92)的播放器同样调用 `appmgr.zyrb.com.cn/tvradio/Tvfront/getTvInfo?tv_id=1`，取匿名响应 `url` | H.264/AAC，1920×1080 |

乐山、眉山还下载并静态核对了官方公开分发的 Android 包：`cn.leshan.leshuileshan` 4.7.2、`mszy.scmstv.cn` 2.2.0。使用包内公开导航接口 `getBottomNavigateNodeList` 与 `nodeClient/node` 定位当前入口；眉山 App 的电视节点和官网只有广播的节点不同。

乐山原始地址当前不要求签名；眉山按官方公开配置生成短签名。两者都会调度到本台目录下的官方 CDN 公网 IP，延续现有的合法会话缓存；只放行嵌入原发布域名和本台完整目录的调度路径，拒绝私网及串台。资阳按网页播放器直接使用接口的 `url`，不从备用 RTMP 字段拼接地址。凉山、资阳的 TS 要求来源头，新增三路全代理；其他新增六路中继清单、分片直连。

## 台标与节目单

- 九路台标逐张下载并查看，均有内置备份。广元、雅安使用官方频道标识，乐山、眉山使用官方台标；宜宾使用与播出角标一致的官方站标。凉山官网白色字标不适合浅色背景，站点原 favicon 连接异常，改用其官方 App 在 Apple 商店提供的台标，并注明平台来源。资阳使用其接口提供的官方台标。未使用目录中的新闻栏目海报、电视直播封面。
- 凉山两套 `lives/{id}/playlists?start=2026-10-23&limit=2` 返回 23、24 日真实编排，新闻综合每天 21 项、彝语综合每天 18 项，已接入今明节目单。抽查新闻、天气预报和跨午夜电视剧的上海时间。
- 广元、宜宾、雅安对应接口今明表为空；资阳节目单接口返回空列表；乐山、眉山电视详情没有可用节目编排。央视网 `gytv1/ybtv1/ybtv2/lstv1/lstv2/yatv1/leshan/meishan/ziyang` 候选均未取得节目单。
- 雅安文化生活虽有目录条目，组件没有直播地址；广元目录中的区县、资阳雁江不属于本轮市州主频道扩展，未加入。

## 仍未接入的 5 个市州

| 市州 | 本轮官方 App 追查结果 |
| --- | --- |
| 德阳 | 官方下载页指向 `com.deyang.dyrongmei`，应用宝入口本次 404；官网旧二维码指向蒲公英，浏览器打开后显示 2022 年 1.0 测试版「安装已结束」，开发者设定的安装时间已过。未取得可独立核验的现用播放接口，不能认定 App 没有电视。 |
| 自贡 | 已核对自贡观察的官方身份及官网关于电视/广播能力的说明。官方下载的旧 `latest` 入口落回门户，所查商店入口未取得有效安装包，未找到可验证的当前电视接口；不继续采用已停止运营的看度自贡旧入口。 |
| 攀枝花 | 根据攀枝花开 App 登记支持网站找到现用 `pzhkai.com` / `pzhxinwen.cn`；核对官方站点配置、直播栏目及版本文件。公开广播电视接口返回 `no access!`，网页直播栏目未给常设电视流；本轮不收录。 |
| 南充 | 南充融媒 App（`com.ds.nctv`）官方身份已确认；沿当前同平台网站配置找到 `nc-m.cnncw.cn`、`nc-api.cnncw.cn`，本机 Python 与 curl 请求均在 TLS 连接阶段失败。旧广电入口和新 App 入口尚未组成可播放链路，不能认定当地停播。 |
| 广安 | 魅力广安现用支持网站 `rmt-m.gatv.com.cn` 的「看电视」及公开 `live/getTVLiveList` 返回新闻综合、文旅乡村两套；对应 `live1.gatv.com.cn:90` 在本机 HTTPS/HTTP 均不能建立可用播放链路。保留接口调查，频道暂不加入。 |

## 验证

真实分片、H.264/AAC 轨道、实际画面及三秒音视频解码均已检查；主项目代理/中继验证见 `verification-apps.json`。宜宾接口和资阳媒体在初次探测时出现过超时，随后的当前入口复测成功，不用成功复测掩盖偶发网络问题。

```sh
node scripts/test-sichuan-cities-apps.mjs
node scripts/probe-sichuan-cities.mjs gytv1 ybtv1 ybtv2 lstv1 lstv2 yatv1 lshantv1 mstv1 zytv1 --base http://127.0.0.1:1924
node scripts/build-epg.mjs sichuan-cities
```
