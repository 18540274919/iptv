export const lifetime=8
export function partsAt(time,duration){
 const part=Math.floor(Math.max(0,time)/60)+1,max=Math.ceil(duration/60),result=[part]
 if(time%60<lifetime&&part>1)result.unshift(part-1)
 if(time%60>=60-lifetime&&part<max)result.push(part+1)
 return result.filter(p=>p>=1&&p<=max)
}
export function layoutBullets(items,width,height,measure){
 const lanes=Math.max(1,Math.min(8,Math.floor(height*.65/27))),previous=Array(lanes).fill(null),result=[]
 for(const item of [...items].sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id))){
  const length=measure(item.text);let lane=-1
  for(let i=0;i<lanes;i++){
   const last=previous[i],gap=last?lifetime*Math.max((last.length+24)/(width+last.length),(length+24)/(width+length)):0
   if(!last||item.time-last.time>=gap){lane=i;break}
  }
  if(lane<0)continue
  previous[lane]={time:item.time,length};result.push({...item,lane,length})
 }return result
}
export function visibleAt(items,time,width){return items.filter(i=>time>=i.time&&time<i.time+lifetime).map(i=>({...i,x:width-(width+i.length)*(time-i.time)/lifetime,y:27*(i.lane+1)}))}
export function createOverlay(video,canvas,toggle,status){
 const ctx=canvas.getContext('2d'),cache=new Map(),pending=new Map(),retry=new Map();let token,duration=0,supported=false,epoch=0,controller=new AbortController(),frame=0,timeline=[],dirty=true,viewWidth=0,viewHeight=0,offsetX=0,offsetY=0
 try{toggle.checked=localStorage.getItem('iqiyi-lab-danmaku')!=='0'}catch{}
 function clear(){ctx.clearRect(0,0,canvas.width,canvas.height);canvas.dataset.visibleCount='0'}
 function cancelFrame(){cancelAnimationFrame(frame);frame=0}
 function geometry(){
  const box=video.getBoundingClientRect(),ratio=devicePixelRatio||1,w=box.width,h=box.height;if(!w||!h)return
  if(canvas.width!==Math.round(w*ratio)||canvas.height!==Math.round(h*ratio)){canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);dirty=true}
  ctx.setTransform(ratio,0,0,ratio,0,0);const scale=Math.min(w/(video.videoWidth||w),h/(video.videoHeight||h));viewWidth=(video.videoWidth||w)*scale;viewHeight=(video.videoHeight||h)*scale;offsetX=(w-viewWidth)/2;offsetY=(h-viewHeight)/2
 }
 function rebuild(){ctx.font='600 18px system-ui';const unique=new Map();for(const data of cache.values())for(const item of data.items)unique.set(item.id,item);timeline=layoutBullets([...unique.values()],viewWidth,Math.max(1,viewHeight-44),text=>ctx.measureText(text).width);dirty=false}
 async function loadPart(part){
  if(cache.has(part)||pending.has(part)||Date.now()<(retry.get(part)||0))return
  const version=epoch,signal=controller.signal
  const task=(async()=>{try{
   const response=await fetch('/api/playback/danmaku',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,part}),signal});const data=await response.json();if(!response.ok)throw Error();if(version!==epoch||!toggle.checked)return
   cache.set(part,data);if(cache.size>24)cache.delete(cache.keys().next().value);dirty=true;render();
  }catch(error){if(version!==epoch||error.name==='AbortError')return;retry.set(part,Date.now()+30000);status.textContent='弹幕暂不可用，不影响视频播放；可关闭后重新开启重试'}finally{if(pending.get(part)===task)pending.delete(part)}})();pending.set(part,task)
 }
 function render(){
  cancelFrame();clear();if(!supported||!toggle.checked||!token||video.hidden||video.seeking)return
  geometry();const time=video.currentTime||0,parts=partsAt(time,duration),current=Math.min(Math.ceil(duration/60),Math.floor(time/60)+1)
  canvas.dataset.time=String(time);canvas.dataset.part=String(current)
  for(const part of parts)void loadPart(part)
  if(dirty)rebuild()
  if(cache.has(current))status.textContent=cache.get(current).items.length?'弹幕已开启':'当前时间段暂无弹幕'
  else status.textContent=Date.now()<(retry.get(current)||0)?'当前时段弹幕暂不可用，不影响视频播放':'正在加载弹幕…'
  const visible=video.seeking?[]:visibleAt(timeline,time,viewWidth)
  ctx.save();ctx.beginPath();ctx.rect(offsetX,offsetY,viewWidth,Math.max(0,viewHeight-44));ctx.clip();ctx.font='600 18px system-ui';ctx.lineWidth=3;ctx.strokeStyle='rgba(0,0,0,.8)';ctx.globalAlpha=.88
  for(const item of visible){ctx.fillStyle=item.color;ctx.strokeText(item.text,offsetX+item.x,offsetY+item.y);ctx.fillText(item.text,offsetX+item.x,offsetY+item.y)}ctx.restore();canvas.dataset.visibleCount=String(visible.length)
  if(!video.paused&&!video.ended&&!video.seeking)frame=requestAnimationFrame(render)
 }
 function resetRequests(){epoch++;controller.abort();controller=new AbortController();pending.clear();retry.clear();cancelFrame();clear()}
 toggle.addEventListener('change',()=>{resetRequests();try{localStorage.setItem('iqiyi-lab-danmaku',toggle.checked?'1':'0')}catch{};if(toggle.checked)render();else status.textContent='弹幕已关闭'})
 for(const name of ['play','playing','pause','seeked','timeupdate','loadedmetadata','resize'])video.addEventListener(name,render)
 video.addEventListener('seeking',()=>{cancelFrame();clear();canvas.dataset.visibleCount='0'})
 video.addEventListener('ended',()=>{cancelFrame();clear()})
 const observer=new ResizeObserver(()=>{dirty=true;render()});observer.observe(video)
 return {
  attach(data){resetRequests();cache.clear();timeline=[];dirty=true;token=data.token;duration=data.duration;supported=data.supported;toggle.disabled=!supported;canvas.hidden=!supported;status.textContent=supported?(toggle.checked?'正在加载弹幕…':'弹幕已关闭'):'当前视频暂无可用的影视弹幕入口';if(supported)render()},
  stop(){resetRequests();token=null;supported=false;cache.clear();timeline=[];toggle.disabled=true;canvas.hidden=true;status.textContent=''},
 }
}
