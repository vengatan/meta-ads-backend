const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const KEY = "lab-results-20260831";
const LABS = [
  { market: "SG", campaign_id: "120247819801850179", currency: "SGD" },
  { market: "TW", campaign_id: "52522604283707", currency: "USD" }
];

async function parse(r){ const t=await r.text(); try{return JSON.parse(t)}catch{return {raw:t}} }
async function g(path, params={}){
  const qs = new URLSearchParams();
  for (const [k,v] of Object.entries(params)) if(v!==undefined && v!==null) qs.set(k, typeof v==='string'?v:JSON.stringify(v));
  qs.set('access_token', process.env.META_ACCESS_TOKEN);
  const r=await fetch(`${GRAPH_BASE}/${path}?${qs}`); const d=await parse(r);
  if(!r.ok||d.error) throw new Error(JSON.stringify(d.error||d)); return d;
}

export default async function handler(req,res){
  res.setHeader('cache-control','no-store'); res.setHeader('x-robots-tag','noindex');
  if(req.query?.k!==KEY) return res.status(404).json({ok:false});
  try{
    const out=[];
    for(const lab of LABS){
      const campaign = await g(lab.campaign_id,{fields:'id,name,status,effective_status,start_time,stop_time'});
      const common='spend,impressions,clicks,inline_link_clicks,ctr,cpc,cpm,actions,action_values,purchase_roas,cost_per_action_type';
      const overall = await g(`${lab.campaign_id}/insights`,{fields:common,level:'campaign',time_range:{since:'2026-08-16',until:'2026-08-31'}});
      const adsets = await g(`${lab.campaign_id}/insights`,{fields:`adset_id,adset_name,${common}`,level:'adset',time_range:{since:'2026-08-16',until:'2026-08-31'},limit:100});
      const placements = await g(`${lab.campaign_id}/insights`,{fields:common,level:'campaign',breakdowns:'publisher_platform,platform_position',time_range:{since:'2026-08-16',until:'2026-08-31'},limit:100});
      const daily = await g(`${lab.campaign_id}/insights`,{fields:common,level:'campaign',time_range:{since:'2026-08-16',until:'2026-08-31'},time_increment:1,limit:100});
      const ads = await g(`${lab.campaign_id}/ads`,{fields:'id,name,status,effective_status,adset_id,created_time,updated_time',limit:100});
      out.push({...lab,campaign,overall:overall.data||[],adsets:adsets.data||[],placements:placements.data||[],daily:daily.data||[],ads:ads.data||[]});
    }
    return res.status(200).json({ok:true,generated_at:new Date().toISOString(),labs:out});
  }catch(e){return res.status(500).json({ok:false,error:e.message});}
}
