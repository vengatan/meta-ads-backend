const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const ACCOUNT_ID = "act_239740063602735";
const CREATIVE_ID = "23851859866720178";
const NONCE = "fkXq3q-VaQwZfE0Y20wpphPXeJa5jaA9";
const TARGETS = [
  ["120247819803730179", "SG Profile Nightlife-EDM | Public control repair v2 2026-08-26"],
  ["120247819803050179", "SG Profile Dining-Cafe | Public control repair v2 2026-08-26"],
  ["120247819801930179", "SG Profile Tech-Finance | Public control repair v2 2026-08-26"]
];

async function metaGet(path, params = {}) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN is not configured");
  const qs = new URLSearchParams({ ...params, access_token: token });
  const r = await fetch(`${GRAPH_BASE}/${path}?${qs}`);
  const data = await r.json();
  if (!r.ok || data.error) throw Object.assign(new Error(data?.error?.message || `Meta GET ${r.status}`), { meta: data?.error || data });
  return data;
}

async function metaPost(path, params = {}) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN is not configured");
  const body = new URLSearchParams({ access_token: token });
  for (const [k,v] of Object.entries(params)) body.set(k, typeof v === "string" ? v : JSON.stringify(v));
  const r = await fetch(`${GRAPH_BASE}/${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const data = await r.json();
  if (!r.ok || data.error) throw Object.assign(new Error(data?.error?.message || `Meta POST ${r.status}`), { meta: data?.error || data });
  return data;
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.query?.k !== NONCE) return res.status(404).json({ ok: false });
  try {
    const creative = await metaGet(CREATIVE_ID, { fields: "id,name,effective_object_story_id" });
    if (String(creative.id) !== CREATIVE_ID) throw new Error("Creative validation failed");
    const results = [];
    for (const [adsetId, name] of TARGETS) {
      const listed = await metaGet(`${adsetId}/ads`, { fields: "id,name,status,effective_status,creative,issues_info", limit: "100" });
      let ad = (listed.data || []).find(x => x.name === name);
      if (!ad) {
        const created = await metaPost(`${ACCOUNT_ID}/ads`, { name, adset_id: adsetId, creative: { creative_id: CREATIVE_ID }, status: "PAUSED" });
        ad = await metaGet(created.id, { fields: "id,name,status,effective_status,creative,issues_info" });
      }
      if (String(ad.creative?.id || "") !== CREATIVE_ID) throw new Error(`Unexpected creative on ${ad.id}`);
      if (ad.status !== "ACTIVE") await metaPost(ad.id, { status: "ACTIVE" });
      const current = await metaGet(ad.id, { fields: "id,name,status,effective_status,creative,issues_info" });
      results.push({ adset_id: adsetId, ...current });
    }
    return res.status(200).json({ ok: true, results });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message, meta: e.meta || null });
  }
}
