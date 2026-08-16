import json, os, time, urllib.parse, urllib.request, urllib.error

TOKEN=open('/tmp/meta_token.txt','r',encoding='utf-8').read().strip()
BASE='https://graph.facebook.com/v25.0'
ACCOUNT='act_239740063602735'
CAMPAIGN='120247819801850179'
GOOD_CREATIVE='1477962000730294'
OLD_ADS=['120247819802880179','120247819803640179','120247819804030179']
CELLS=[
 ('Tech-Finance','120247819801930179'),
 ('Dining-Cafe','120247819803050179'),
 ('Nightlife-EDM','120247819803730179'),
]

def req(method,path,params=None):
    url=BASE+'/'+path.lstrip('/')
    data=None
    if params is not None:
        enc={}
        for k,v in params.items():
            if isinstance(v,(dict,list,bool)): enc[k]=json.dumps(v,separators=(',',':'))
            elif v is not None: enc[k]=str(v)
        data=urllib.parse.urlencode(enc).encode()
    r=urllib.request.Request(url,data=data,method=method,headers={'Authorization':'Bearer '+TOKEN})
    try:
        with urllib.request.urlopen(r,timeout=60) as x: body=x.read().decode()
    except urllib.error.HTTPError as e:
        body=e.read().decode(errors='replace'); print(f'META_ERROR {method} {path} {e.code}: {body}'); raise
    return json.loads(body)

def post(path,**p): return req('POST',path,p)
def get(path,fields): return req('GET',path+'?'+urllib.parse.urlencode({'fields':fields}))

# Verify source creative is currently valid before changing anything.
source=get(GOOD_CREATIVE,'id,name,status,effective_object_story_id')
if source.get('status')!='ACTIVE': raise SystemExit('Source creative is not ACTIVE')
print('SOURCE_CREATIVE_OK',source.get('id'),source.get('effective_object_story_id'))

created=[]
try:
    # Keep campaign paused while replacements are being built.
    post(CAMPAIGN,status='PAUSED')
    for cell,adset in CELLS:
        out=post(f'{ACCOUNT}/ads',name=f'SG Profile {cell} | Proven control v2',adset_id=adset,creative={'creative_id':GOOD_CREATIVE},status='ACTIVE')
        created.append((cell,out['id']))
        print('CREATED_REPLACEMENT',cell,out['id'])
    time.sleep(12)
    hard=[]
    for cell,adid in created:
        obj=get(adid,'id,name,status,effective_status,issues_info,creative,adset_id')
        print('REPLACEMENT_STATUS',cell,json.dumps(obj,separators=(',',':')))
        if obj.get('effective_status') in {'WITH_ISSUES','DISAPPROVED','ERROR'}:
            hard.append((cell,adid,obj.get('effective_status'),obj.get('issues_info')))
    if hard:
        raise RuntimeError('Replacement ads have hard issues: '+repr(hard))

    # Remove only the three broken duplicate ads after replacements pass hard-error check.
    for old in OLD_ADS:
        post(old,status='DELETED')
        print('DELETED_BROKEN_AD',old)
    post(CAMPAIGN,status='ACTIVE')
    time.sleep(3)
    camp=get(CAMPAIGN,'id,name,status,effective_status')
    print('SG_CAMPAIGN_FINAL',json.dumps(camp,separators=(',',':')))
    print('RESULT=SUCCESS')
except Exception as e:
    post(CAMPAIGN,status='PAUSED')
    print('SAFETY_PAUSED_SG_CAMPAIGN',CAMPAIGN)
    print('RESULT=FAILED',repr(e))
    raise
