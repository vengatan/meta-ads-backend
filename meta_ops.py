import json, os, urllib.parse, urllib.request, urllib.error
from datetime import datetime, timedelta, timezone

TOKEN = open('/tmp/meta_token.txt','r',encoding='utf-8').read().strip()
if not TOKEN:
    raise SystemExit('No decrypted token')

GV='v25.0'
BASE=f'https://graph.facebook.com/{GV}'


def request(method, path, params=None):
    url=BASE+'/'+path.lstrip('/')
    data=None
    if params is not None:
        enc={}
        for k,v in params.items():
            if isinstance(v,(dict,list,bool)):
                enc[k]=json.dumps(v,separators=(',',':'))
            elif v is not None:
                enc[k]=str(v)
        data=urllib.parse.urlencode(enc).encode()
    req=urllib.request.Request(url,data=data,method=method,headers={'Authorization':'Bearer '+TOKEN})
    try:
        with urllib.request.urlopen(req,timeout=60) as r:
            body=r.read().decode()
    except urllib.error.HTTPError as e:
        body=e.read().decode(errors='replace')
        print(f'META_ERROR {method} {path} HTTP {e.code}: {body}')
        raise
    out=json.loads(body)
    if isinstance(out,dict) and out.get('error'):
        print(f'META_ERROR {method} {path}: {json.dumps(out)}')
        raise RuntimeError(out['error'])
    return out


def post(path, **params):
    return request('POST',path,params)


def get(path, **params):
    q=urllib.parse.urlencode({k:(json.dumps(v,separators=(',',':')) if isinstance(v,(dict,list,bool)) else str(v)) for k,v in params.items()})
    return request('GET',path+('?' + q if q else ''))


SG='act_239740063602735'
TW='act_586574771435951'

# Token permission is authoritative: verify both accounts before any mutation.
accts=get('me/adaccounts',fields='id,name,currency,account_status',limit=500)
ids={x.get('id') for x in accts.get('data',[])}
missing=[x for x in (SG,TW) if x not in ids]
if missing:
    raise SystemExit('Token does not expose required account(s): '+','.join(missing))
print('TOKEN_ACCOUNT_CHECK=PASS SG+TW')

now=datetime.now(timezone.utc)
start=(now+timedelta(minutes=30)).replace(microsecond=0)
end=start+timedelta(days=14)
start_s=start.strftime('%Y-%m-%dT%H:%M:%S%z')
end_s=end.strftime('%Y-%m-%dT%H:%M:%S%z')
stamp=now.strftime('%Y%m%d-%H%M')

# Pure cold profiling: no customer, purchaser, order, website-visitor, health or identity-derived audiences.
common_places={
    'publisher_platforms':['facebook','instagram'],
    'facebook_positions':['feed','story'],
    'instagram_positions':['stream','story','reels'],
    'device_platforms':['mobile','desktop'],
}

sg_cells=[
    ('Tech-Finance', {'interests':[
        {'id':'6003985771306','name':'Technology (computers and electronics)'},
        {'id':'6003164535634','name':'Information technology (computers and electronics)'},
        {'id':'444620642403378','name':'Financial technology'}]}),
    ('Dining-Cafe', {'interests':[
        {'id':'6003436950375','name':'Restaurants (dining)'},
        {'id':'6003626773307','name':'Coffee (food and drink)'},
        {'id':'6003120620858','name':'Coffeehouses (coffee)'}]}),
    ('Nightlife-EDM', {'interests':[
        {'id':'6003375995381','name':'nightlife (bars, clubs and nightlife)'},
        {'id':'6003361714600','name':'Nightclubs (bars, clubs and nightlife)'},
        {'id':'6003155409305','name':'Electronic dance music (music)'}]})
]

tw_cells=[
    ('Nightlife', {'interests':[
        {'id':'6003375995381','name':'nightlife (bars, clubs and nightlife)'},
        {'id':'6003361714600','name':'Nightclubs (bars, clubs and nightlife)'},
        {'id':'6003155409305','name':'Electronic dance music (music)'}]}),
    ('Engaged-Shoppers', {'behaviors':[
        {'id':'6071631541183','name':'Engaged shoppers'}]}),
    ('Dining-Cafe', {'interests':[
        {'id':'6003436950375','name':'Restaurants (dining)'},
        {'id':'6003626773307','name':'Coffee (food and drink)'},
        {'id':'6003120620858','name':'Coffeehouses (coffee)'}]})
]

# Exact maximums: SG 3 x S$98 = S$294; TW 3 x US$70 = US$210.
# Lifetime budgets are used instead of daily budgets to enforce hard experiment caps.
markets=[
    dict(market='SG', account=SG, pixel='244962973380244', cells=sg_cells, lifetime=9800, age_min=24, age_max=50, creative='1677420986472049'),
    dict(market='TW', account=TW, pixel='209850509573148', cells=tw_cells, lifetime=7000, age_min=25, age_max=50, creative='1651679552211797'),
]

created={'campaigns':{},'adsets':[],'ads':[]}
try:
    for m in markets:
        market=m['market']; account=m['account']
        campaign_name=f'VMG Cold Profile Lab {market} {stamp}'
        c=post(f'{account}/campaigns',name=campaign_name,objective='OUTCOME_SALES',status='PAUSED',special_ad_categories=[])
        cid=c['id']
        created['campaigns'][market]=cid
        print(f'CREATED_CAMPAIGN {market} {cid} PAUSED')

        for cell_name,profile in m['cells']:
            targeting={
                'age_min':m['age_min'],'age_max':m['age_max'],'genders':[1],
                'geo_locations':{'countries':[market],'location_types':['home','recent']},
                'flexible_spec':[profile],
                'targeting_automation':{'advantage_audience':0,'individual_setting':{'age':0,'gender':0,'geo':0}},
                **common_places,
            }
            a=post(f'{account}/adsets',
                name=f'{market} Profile {cell_name} | 14d capped',
                campaign_id=cid,
                lifetime_budget=m['lifetime'],
                billing_event='IMPRESSIONS',
                optimization_goal='OFFSITE_CONVERSIONS',
                bid_strategy='LOWEST_COST_WITHOUT_CAP',
                promoted_object={'pixel_id':m['pixel'],'custom_event_type':'PURCHASE'},
                attribution_spec=[
                    {'event_type':'CLICK_THROUGH','window_days':7},
                    {'event_type':'VIEW_THROUGH','window_days':1},
                ],
                targeting=targeting,
                start_time=start_s,end_time=end_s,status='ACTIVE')
            aid=a['id']
            created['adsets'].append((market,cell_name,aid,m['lifetime']))
            print(f'CREATED_ADSET {market} {cell_name} {aid} ACTIVE_UNDER_PAUSED_CAMPAIGN')

            ad=post(f'{account}/ads',name=f'{market} Profile {cell_name} | Control creative',adset_id=aid,creative={'creative_id':m['creative']},status='ACTIVE')
            adid=ad['id']
            created['ads'].append((market,cell_name,adid))
            print(f'CREATED_AD {market} {cell_name} {adid}')

    # Validate every ad set before either campaign is activated.
    for market,cell,aid,expected_lifetime in created['adsets']:
        obj=get(aid,fields='id,name,status,effective_status,lifetime_budget,start_time,end_time,targeting,optimization_goal,promoted_object')
        if str(obj.get('status'))!='ACTIVE':
            raise RuntimeError(f'Validation failed: {aid} status={obj.get("status")}')
        if str(obj.get('optimization_goal'))!='OFFSITE_CONVERSIONS':
            raise RuntimeError(f'Validation failed: {aid} optimization={obj.get("optimization_goal")}')
        if int(obj.get('lifetime_budget',0)) != int(expected_lifetime):
            raise RuntimeError(f'Validation failed: {aid} lifetime={obj.get("lifetime_budget")}')
        print(f'VALIDATED_ADSET {market} {cell} {aid} lifetime={obj.get("lifetime_budget")}')

    # Activate only after all six cells validate. If activation partially fails, safety handler pauses both.
    for market,cid in created['campaigns'].items():
        post(cid,status='ACTIVE')
        chk=get(cid,fields='id,name,status,effective_status')
        print(f'ACTIVATED_CAMPAIGN {market} {cid} status={chk.get("status")} effective={chk.get("effective_status")}')

    print('RESULT=SUCCESS')
    print('SCHEDULE_START_UTC='+start_s)
    print('SCHEDULE_END_UTC='+end_s)
    print('SG_TOTAL_LIFETIME_MINOR=29400')
    print('TW_TOTAL_LIFETIME_MINOR=21000')
except Exception as e:
    for market,cid in created['campaigns'].items():
        try:
            post(cid,status='PAUSED')
            print(f'SAFETY_PAUSED {market} {cid}')
        except Exception as pe:
            print(f'SAFETY_PAUSE_FAILED {market} {cid}: {pe}')
    print('RESULT=FAILED '+repr(e))
    raise
finally:
    try: os.remove('/tmp/meta_token.txt')
    except OSError: pass
