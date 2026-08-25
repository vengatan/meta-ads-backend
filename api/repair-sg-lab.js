const crypto = require("node:crypto");

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const ONE_TIME_KEY = "izKgY_MzVF2kYxIxKhUcqRNLl9uPoOCQuXd7kqS_-KE";
const ACCOUNT_ID = "act_239740063602735";
const CREATIVE_NAME = "SG Cold Profile Lab control repair 2026-08-26";

const ADSETS = [
  ["120247819801930179", "SG Profile Tech-Finance | Control repair 2026-08-26"],
  ["120247819803050179", "SG Profile Dining-Cafe | Control repair 2026-08-26"],
  ["120247819803730179", "SG Profile Nightlife-EDM | Control repair 2026-08-26"],
];

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

async function parse(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function graphGet(path, params = {}) {
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k,v]) => [k,String(v)])), access_token: process.env.META_ACCESS_TOKEN });
  const r = await fetch(`${GRAPH_BASE}/${path}?${qs}`);
  const d = await parse(r);
  if (!r.ok || d.error) throw new Error(JSON.stringify(d.error || d));
  return d;
}

async function graphPost(path, params = {}) {
  const body = new URLSearchParams();
  body.set("access_token", process.env.META_ACCESS_TOKEN);
  for (const [k,v] of Object.entries(params)) body.set(k, typeof v === "string" ? v : JSON.stringify(v));
  const r = await fetch(`${GRAPH_BASE}/${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  const d = await parse(r);
  if (!r.ok || d.error) throw new Error(JSON.stringify(d.error || d));
  return d;
}

module.exports = async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-robots-tag", "noindex");
  if (!safeEqual(req.query && req.query.k, ONE_TIME_KEY)) return res.status(404).json({ ok:false });
  if (!process.env.META_ACCESS_TOKEN) return res.status(503).json({ ok:false, error:"META_ACCESS_TOKEN missing" });

  try {
    const story = {
      page_id: "1739278202817541",
      instagram_user_id: "17841407274095257",
      link_data: {
        link: "https://prepsingapore.com/",
        message: "We help Singaporeans who want to protect themselves from HIV with affordable PrEP access through doctors in Asia. https://prepsingapore.com/ - Get PrEP now.\n1. Register & Place an order on prepsingapore.com\n2. Visit your preferred clinic we provide after payment\n3. Become PrEPed!",
        name: "HIV Prevention is a reality",
        caption: "PREPSINGAPORE.COM",
        image_hash: "752a6eabe70b5a1a7c672003139dd53e",
        call_to_action: { type: "SEE_DETAILS", value: { link: "https://prepsingapore.com/" } }
      }
    };

    const creative = await graphPost(`${ACCOUNT_ID}/adcreatives`, { name: CREATIVE_NAME, object_story_spec: story });
    const created = [];

    for (const [adsetId, name] of ADSETS) {
      const existing = await graphGet(`${adsetId}/ads`, { fields: "id,name,status,effective_status", limit: 100 });
      const found = (existing.data || []).find(x => x.name === name);
      if (found) {
        created.push({ adset_id: adsetId, existing: true, ...found });
        continue;
      }
      const ad = await graphPost(`${ACCOUNT_ID}/ads`, {
        name,
        adset_id: adsetId,
        creative: { creative_id: String(creative.id) },
        status: "PAUSED"
      });
      created.push({ adset_id: adsetId, ad_id: ad.id, status: "PAUSED" });
    }

    return res.status(200).json({ ok:true, creative_id: creative.id, ads: created });
  } catch (e) {
    return res.status(500).json({ ok:false, error:e.message });
  }
};
