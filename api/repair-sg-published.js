const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const KEY = "sgpub_20260829_q2Z4W9nR8p";
const ACCOUNT_ID = "act_239740063602735";
const PAGE_ID = "1739278202817541";
const IG_ID = "17841407274095257";
const IMAGE_HASH = "752a6eabe70b5a1a7c672003139dd53e";
const PREFIX = "SG Lab repaired 2026-08-29";
const ADSETS = [
  ["120247819801930179", `${PREFIX} | Tech-Finance`],
  ["120247819803050179", `${PREFIX} | Dining-Cafe`],
  ["120247819803730179", `${PREFIX} | Nightlife-EDM`]
];

async function parse(r) {
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function graphGet(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k,v] of Object.entries(params)) qs.set(k, String(v));
  qs.set("access_token", process.env.META_ACCESS_TOKEN);
  const r = await fetch(`${GRAPH_BASE}/${path}?${qs}`);
  const d = await parse(r);
  if (!r.ok || d.error) throw Object.assign(new Error((d.error && d.error.message) || `GET ${r.status}`), { meta: d.error || d });
  return d;
}

async function graphPost(path, params = {}) {
  const body = new URLSearchParams();
  body.set("access_token", process.env.META_ACCESS_TOKEN);
  for (const [k,v] of Object.entries(params)) body.set(k, typeof v === "string" ? v : JSON.stringify(v));
  const r = await fetch(`${GRAPH_BASE}/${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const d = await parse(r);
  if (!r.ok || d.error) throw Object.assign(new Error((d.error && d.error.message) || `POST ${r.status}`), { meta: d.error || d });
  return d;
}

function okKey(req) {
  return req.query && req.query.k === KEY;
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-robots-tag", "noindex");
  if (!okKey(req)) return res.status(404).json({ ok:false });
  if (!process.env.META_ACCESS_TOKEN) return res.status(503).json({ ok:false, error:"META_ACCESS_TOKEN missing" });

  const phase = String((req.query && req.query.phase) || "create");
  try {
    if (phase === "create") {
      const story = {
        page_id: PAGE_ID,
        instagram_user_id: IG_ID,
        link_data: {
          link: "https://prepsingapore.com/",
          message: "We help Singaporeans who want to protect themselves from HIV with affordable PrEP access through doctors in Asia. https://prepsingapore.com/ - Get PrEP now.\n1. Register & Place an order on prepsingapore.com\n2. Visit your preferred clinic we provide after payment\n3. Become PrEPed!",
          name: "HIV Prevention is a reality",
          caption: "PREPSINGAPORE.COM",
          image_hash: IMAGE_HASH,
          call_to_action: { type: "SEE_DETAILS", value: { link: "https://prepsingapore.com/" } }
        }
      };
      const creative = await graphPost(`${ACCOUNT_ID}/adcreatives`, { name: `${PREFIX} | control creative`, object_story_spec: story });
      const ads = [];
      for (const [adsetId, name] of ADSETS) {
        const existing = await graphGet(`${adsetId}/ads`, { fields: "id,name,status,effective_status", limit: 100 });
        let ad = (existing.data || []).find(x => x.name === name);
        if (!ad) {
          const created = await graphPost(`${ACCOUNT_ID}/ads`, { name, adset_id: adsetId, creative: { creative_id: String(creative.id) }, status: "PAUSED" });
          ad = { id: created.id, name, status: "PAUSED" };
        }
        ads.push({ adset_id: adsetId, ...ad });
      }
      return res.status(200).json({ ok:true, phase, creative_id: creative.id, ads });
    }

    if (phase === "activate") {
      const results = [];
      for (const [adsetId, name] of ADSETS) {
        const existing = await graphGet(`${adsetId}/ads`, { fields: "id,name,status,effective_status", limit: 100 });
        const ad = (existing.data || []).find(x => x.name === name);
        if (!ad) throw new Error(`Missing repaired ad: ${name}`);
        const updated = await graphPost(String(ad.id), { status: "ACTIVE" });
        results.push({ adset_id: adsetId, ad_id: ad.id, name, updated });
      }
      return res.status(200).json({ ok:true, phase, ads: results });
    }

    return res.status(400).json({ ok:false, error:"phase must be create or activate" });
  } catch (e) {
    return res.status(500).json({ ok:false, phase, error:e.message, meta:e.meta || null });
  }
}
