"""Decode only complete clear HLS returned to the isolated official player."""
import json,pathlib,subprocess,re,os
root=pathlib.Path(__file__).resolve().parents[1]
runtime=pathlib.Path(os.environ['IQIYI_VOD_RUNTIME_DIR'])
out=pathlib.Path(os.environ.get('IQIYI_REPORT_DIR',str(root/'research')))
results=[]
for sample in ([os.environ['IQIYI_SAMPLE_ID']] if os.environ.get('IQIYI_SAMPLE_ID') else ['movie','drama']):
 report=json.loads((out/f'{sample}.json').read_text())
 result={'sample':sample,'title':report.get('title'),'officialPage':report['url'],'account':report['account'],'candidates':[]}
 candidates=[]
 required={'movie':8146,'drama':1501}.get(sample,report.get('expectedSeconds',0))
 if not isinstance(required,(int,float)) or not 10<=required<=86400:raise ValueError('Invalid official full duration')
 expected=max([v.get('duration') or 0 for v in report.get('video',[])]+[0])
 for dash in report.get('dash',[]):
  for v in dash['videos']:
   full=(v['hasInlineHls'] and v['endList'] and v['duration']>0 and (v.get('expectedDuration') or expected)>0 and abs(v['duration']-float(v.get('expectedDuration') or expected))<=10)
   full=full and v.get('schedulerFiles',0)>0 and v.get('resolvedFiles',0)==v.get('schedulerFiles',0) and abs(v['duration']-required)<=10 and not report.get('error')
   preview=str(v.get('isPreview'))=='1' or float(v.get('ptt') or 0)>0
   clear=not any(m!='NONE' for m in v['keyMethods']) and v.get('drmType') in [None,0,1]
   if full and not preview and clear and v.get('codec') in [None,2]:candidates.append(v)
   result['candidates'].append({k:v.get(k) for k in ['bid','size','expectedDuration','duration','isPreview','ptt','drmType','keyMethods','hasInlineHls','segments']})
 if candidates:
  v=max(candidates,key=lambda v:float(v.get('bid') or 0));manifest=out/v['manifestFile']
  result['manifest']=v['manifestFile'];result['seconds']=v['duration'];result['checks']=[]
  for label,seek in [('beginning',0),('near-end',max(0,v['duration']-20))]:
   cmd=['ffmpeg','-hide_banner','-loglevel','error','-protocol_whitelist','file,http,https,tcp,tls,crypto','-ss',str(seek),'-i',str(manifest),'-t','5','-progress','pipe:1','-nostats','-f','null','-']
   try:
    p=subprocess.run(cmd,capture_output=True,text=True,timeout=45)
    vals=dict(line.split('=',1) for line in p.stdout.splitlines() if '=' in line)
    frames=int(vals.get('frame',0));ok=p.returncode==0 and frames>0 and int(vals.get('out_time_us',0))>=4000000
    result['checks'].append({'position':label,'seek':seek,'ok':ok,'frames':frames,'outTime':vals.get('out_time'),'error':re.sub(r'https?://\S+','[media URL]',p.stderr)[-400:] if not ok else ''})
   except subprocess.TimeoutExpired:result['checks'].append({'position':label,'ok':False,'error':'decode timeout'})
  result['completeClearHlsVerified']=all(c['ok'] for c in result['checks'])
 else:result['completeClearHlsVerified']=False
 results.append(result)
 print(json.dumps(result,ensure_ascii=False))
(out/'verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))

if any(not r.get('completeClearHlsVerified') for r in results):
 diagnostic=runtime/('decode-last-'+sample+'.json')
 diagnostic.write_text(json.dumps([{k:r.get(k) for k in ['sample','candidates','checks','seconds','completeClearHlsVerified']} for r in results]))
 diagnostic.chmod(0o600)
