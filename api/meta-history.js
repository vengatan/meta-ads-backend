const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const KEY = "meta-history-20260831";
const ACCOUNTS = [
  { market: "SG", id: "act_239740063602735", currency: "SGD" },
  { market: "TW", id: "act_586574771435951", currency: "USD" }
];

async function parse(r){const t=await r.text();try{return JSON.parse(t)}catch{return {raw:t}}}
async function g(path, params={}){
  const qs=new URLSearchParams();
  for(const [k,v] of Object.entries(params)) if(v!==undefined&&v!==null) qs.set(k, typeof v==='string'?v:JSON.stringify(v));
  qs.set('access_token',process.env.META_ACCESS_TOKEN);
  const r=await fetch(`${GRAPH_BASE}/${path}?${qs}`); const d=await parse(r);
  if(!r.ok||d.error) throw new Error(JSON.stringify(d.error||d)); return d;
}
function action(rows,type){return Number((rows||[]).find(x=>x.action_type===type)?.value||0)}
function val(rows,type){return Number((rows||[]).find(x=>x.action_type===type)?.value||0)}
function summarizeTargeting(t={}){
  const groups=(t.flexible_spec||[]).map((grp,i)=>({
    group:i+1,
    interests:(grp.interests||[]).map(x=>x.name),
    behaviors:(grp.behaviors||[]).map(x=>x.name),
    life_events:(grp.life_events||[]).map(x=>x.name),
    industries:(grp.industries||[]).map(x=>x.name),
    work_positions:(grp.work_positions||[]).map(x=>x.name),
    education_majors:(grp.education_majors||[]).map(x=>x.name),
    relationship_statuses:grp.relationship_statuses||[]
  }));
  return {
    age_min:t.age_min||null, age_max:t.age_max||null, genders:t.genders||[],
    custom_audiences:(t.custom_audiences||[]).map(x=>({id:x.id,name:x.name||null})),
    excluded_custom_audiences:(t.excluded_custom_audiences||[]).map(x=>({id:x.id,name:x.name||null})),
    flexible_spec_groups:groups,
    detailed_and_group_count:groups.length,
    targeting_automation:t.targeting_automation||null
  };
}
export default async function handler(req,res){
  res.setHeader('cache-control','no-store'); res.setHeader('x-robots-tag','noindex');
  if(req.query?.k!==KEY) return res.status(404).json({ok:false});
  try{
    const out=[];
    for(const a of ACCOUNTS){
      const insights=await g(`${a.id}/insights`,{level:'adset',fields:'adset_id,adset_name,spend,impressions,clicks,actions,action_values,purchase_roas',time_range:{since:'2025-09-01',until:'2026-08-31'},limit:500});
      const rows=[];
      for(const r of (insights.data||[]).filter(x=>Number(x.spend||0)>=5)){
        let adset={};
        try{adset=await g(r.adset_id,{fields:'id,name,campaign_id,status,effective_status,created_time,start_time,end_time,targeting,optimization_goal,promoted_object'});}catch(e){adset={id:r.adset_id,name:r.adset_name,targeting:{},read_error:true};}
        const purchases=action(r.actions,'omni_purchase')||action(r.actions,'purchase');
        const purchase_value=val(r.action_values,'omni_purchase')||val(r.action_values,'purchase');
        rows.push({
          adset_id:r.adset_id, adset_name:r.adset_name, spend:Number(r.spend||0), impressions:Number(r.impressions||0), clicks:Number(r.clicks||0),
          purchases, purchase_value, roas:Number(r.purchase_roas?.find(x=>x.action_type==='omni_purchase')?.value|| (Number(r.spend||0)>0?purchase_value/Number(r.spend||0):0)),
          campaign_id:adset.campaign_id||null, created_time:adset.created_time||null, status:adset.status||null, optimization_goal:adset.optimization_goal||null,
          targeting:summarizeTargeting(adset.targeting||{}), read_error:!!adset.read_error
        });
      }
      out.push({...a,rows});
    }
    return res.status(200).json({ok:true,period:['2025-09-01','2026-08-31'],generated_at:new Date().toISOString(),accounts:out});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
}
