# 市县台（广电云）

杭州广电云（web.guangdianyun.tv）给大量市县级融媒体中心、电视台托管直播，CDN 是奥点云（`*.hlsplay.aodianyun.com`）。本模块收录其中 95 路电视频道，按省归组，每轮刷新只输出正在推流的台。

频道表来自 TG 群友提供的 PHP（113 个直播间），2026-10-24 逐台核对：

| 结果 | 台数 | 处理 |
| --- | --- | --- |
| 在推流、画面是电视台 | 73 | 收录 |
| 官方 `liveStatus=0`、清单 `stream not found` | 22 | 收录，停推期间不输出，恢复后自动出现 |
| 官方回「直播间不存在 / 用户不存在」 | 10 | 不收 |
| 活动直播间、网络台、慢直播、重复线路 | 8 | 不收，见 channels.js 顶部注释 |

## 官方接口

都要带 `Origin` / `Referer: https://web.guangdianyun.tv/`。

- 频道信息：`https://1812501212048408.cn-hangzhou.fc.aliyuncs.com/2016-08-15/proxy/node-api.online/node-api/tv/channelInfo?id=<pid>&uin=<uin>`，给 `liveStatus`（1 在推流）、`sub_key`、`logoUrl`。`updateTime` 每天都变，不能用来判断停推多久。
- 播放地址：同前缀 `/tv/getPlayAddress?id&uin&clientId=<uuid>`，给带 `auth_key`（约一年）和 `extra_key` 的 HLS 地址。
- 节目单：`https://programme.guangdianyun.tv/v1/programme/Index/getListByChannel?channelId&uin&date=YYYY-MM-DD`，见 epg.js。
- 官网播放页：`https://web.guangdianyun.tv/tv/<pid>?uin=<uin>`。

## 在线会话（为什么要两条 WebSocket）

`extra_key` 只对「在线」的 clientId 有效，实测：

1. 取地址前，统计连接 `wss://bapi.guangdianyun.tv/v1/stats/channel/watchTime` 发一条 `msg:"first"` 的 JSON 心跳（回 `OK`），消息连接 `wss://mqttdms.aodianyun.com:8300/mqtt`（子协议 `mqtt`）发 MQTT CONNECT，clientId 是同一个 uuid、password 是 `sub_key`（回 CONNACK）。两条都在线时取的地址才能用，缺一条清单 403。订阅主题可以不发。
2. 地址拿到后两条连接都要一直开着并保活（MQTT PINGREQ + `msg:""` 心跳）。同一地址连拉 5 分钟始终 200；只剩 MQTT 约 20 秒失效，只剩心跳约 60 秒失效。
3. 断过一次就永久 403，同一 clientId 重新上线也救不回，只能换 clientId 重新取地址。
4. 分片自带 24 小时 `auth_key`，不看在线状态，播放器直连即可。
5. 淮安、金普、永嘉等少数租户不校验 `extra_key`，同样走会话，不分支。

所以模块按「有人在看」开会话：频道标 `relayHls`，播放器每轮询一次清单都会调到 `resolve`。第一次调用时上线取地址，之后每次调用续期并顺带取回清单交给本机中继；空闲 90 秒关掉两条连接。清单 403 换 clientId 重来一次，404 当台方停推。

原 PHP 把地址缓存 24 小时、每次请求临时开一下连接，对校验 `extra_key` 的租户不成立，群友大概只用不校验的几台验过。

## 开销

10 台同时保活 2 分钟：内存约 +20MB，保活流量约每秒 85 字节，CPU 合计 22 毫秒，10 台地址全程有效。没人看的台不开任何连接。

## 台标与节目单

- 台标：官方 `logoUrl` 只有 14 台有，温岭那张是二维码不用，其余 13 张写死在频道表；别的台官方没有。
- 节目单：23 台有今明两天编排，濮阳新闻综合整点「节目回放」是回看占位、丢掉，其余台表为空。

## 可达性

CDN 直连没有地域限制（Globalping 大陆探针与海外出口结果一致）。会话连接与取清单走同一个系统代理出口；`extra_key` 是否绑定出口 IP 没有验证过。
