import {createHash} from 'node:crypto'
import {brotliDecompressSync} from 'node:zlib'
const fail=message=>Object.assign(new Error(message),{code:'UNAVAILABLE'})
// URL and protobuf fields observed in the current official iqiyi-pcw-ui SDK.
export function bulletUrl(videoId,part){
 if(!/^\d{1,20}$/.test(String(videoId))||!Number.isInteger(part)||part<1||part>1440)throw fail('弹幕参数无效')
 const name=`${videoId}_60_${part}`,hash=createHash('md5').update(name+'cbzuw1259a').digest('hex').slice(-8),padded='0000'+videoId
 return `https://cmts.iqiyi.com/bullet/${padded.slice(-4,-2)}/${padded.slice(-2)}/${name}_${hash}.br`
}
function fields(buffer){
 let at=0;const result=[]
 function varint(){let value=0,multiplier=1;for(let n=0;n<8;n++){if(at>=buffer.length)throw fail('弹幕数据截断');const b=buffer[at++];value+=(b&127)*multiplier;if(!(b&128)){if(!Number.isSafeInteger(value))throw fail('弹幕字段溢出');return value}multiplier*=128}throw fail('弹幕字段无效')}
 while(at<buffer.length){if(result.length>200000)throw fail('弹幕字段过多');const tag=varint(),id=Math.floor(tag/8),wire=tag%8;if(!id)throw fail('弹幕字段无效')
  if(wire===2){const length=varint();if(at+length>buffer.length)throw fail('弹幕数据截断');result.push({id,value:buffer.subarray(at,at+length)});at+=length}
  else if(wire===0){varint()}
  else if(wire===1||wire===5){at+=wire===1?8:4;if(at>buffer.length)throw fail('弹幕数据截断')}
  else throw fail('弹幕格式不受支持')
 }return result
}
const str=(rows,id)=>rows.find(f=>f.id===id)?.value.toString('utf8')||''
export function decodeBullets(compressed,part){
 let raw;try{raw=brotliDecompressSync(compressed,{maxOutputLength:8*1024*1024})}catch{throw fail('弹幕解压失败')}
 const root=fields(raw);if(str(root,1)!=='A00000')throw fail('官网未返回正常弹幕数据')
 const items=[];let index=0
 for(const group of root.filter(f=>f.id===6)){
  const entries=fields(group.value),bucket=Number(str(entries,1))
  for(const entry of entries.filter(f=>f.id===2)){
   const f=fields(entry.value),text=str(f,2).replace(/[\u0000-\u001f\u007f]/g,'').slice(0,300),time=Number(str(f,6)||bucket),color=str(f,8)
   if(!text||!Number.isFinite(time)||time<(part-1)*60||time>part*60)continue
   // Do not forward profile, avatar, author id, links or interaction metadata.
   items.push({id:`${part}-${index++}`,time,text,color:/^[a-f0-9]{6}$/i.test(color)?'#'+color:'#ffffff'})
   if(items.length>=10000)break
  }if(items.length>=10000)break
 }return {part,start:(part-1)*60,end:part*60,items:items.sort((a,b)=>a.time-b.time)}
}
async function boundedBody(response){
 if(Number(response.headers.get('content-length'))>2*1024*1024)throw fail('弹幕响应过大')
 const chunks=[];let length=0;const reader=response.body.getReader()
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>2*1024*1024)throw fail('弹幕响应过大');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
 return Buffer.concat(chunks,length)
}
export function createDanmaku({fetchImpl=fetch,now=Date.now,ttlMs=600000}={}){
 const cache=new Map(),pending=new Map(),controller=new AbortController();let closed=false
 async function get(videoId,part){
  const url=bulletUrl(videoId,part),key=videoId+'|'+part;if(closed)throw fail('弹幕服务已停止')
  const saved=cache.get(key);if(saved&&now()<saved.expires)return saved.data
  if(pending.has(key))return pending.get(key)
  const task=(async()=>{
   const r=await fetchImpl(url,{headers:{Referer:'https://www.iqiyi.com/','User-Agent':'Mozilla/5.0'},redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])})
   let data;if(r.status===404){await r.body?.cancel();data={part,start:(part-1)*60,end:part*60,items:[]}}else{if(!r.ok){await r.body?.cancel();throw fail('官网弹幕暂不可用')}data=decodeBullets(await boundedBody(r),part)}
   cache.delete(key);cache.set(key,{data,expires:now()+ttlMs});if(cache.size>128)cache.delete(cache.keys().next().value);return data
  })().finally(()=>pending.delete(key));pending.set(key,task);return task
 }
 return {get,async close(){closed=true;controller.abort();await Promise.allSettled([...pending.values()])}}
}
