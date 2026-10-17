// Applies before any official page script runs, including legacy image beacons.
export function blockedRequest({url,method='GET',type='fetch'},{blockMedia=false}={}){
 const u=new URL(url)
 if(!['GET','HEAD','OPTIONS'].includes(method)||type==='ping'||/(^|[.-])rcd\.iqiyi\.com$/.test(u.hostname))return 'writes'
 if(/del_play_history|clear_play_history|(?:upload|save|add|set)_?(?:play_?)?(?:history|record)|\/record\/(?:add|upload|save)|pingback|\/report\b/.test(u.pathname))return 'writes'
 if(['xhr','fetch'].includes(type)&&/history|record/i.test(u.pathname)&&!/^\/tvg\/my\/lw\/v2\/play_history$/.test(u.pathname))return 'writes'
 if(blockMedia&&(type==='media'||/\/(?:jp\/)?dash$|\/v\.f4v$|\.(?:m3u8|mpd|ts|m4s|mp4)$/.test(u.pathname)))return 'media'
 return null
}
