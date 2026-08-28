import sharp from "sharp";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const KEY = "sgnative_20260829_7mK4cN2vP9";
const ACCOUNT_ID = "act_239740063602735";
const PAGE_ID = "1739278202817541";
const IG_ID = "17841407274095257";
const DESTINATION = "https://prepsingapore.com/";
const SOURCE_IMAGE = "https://scontent-ams2-1.xx.fbcdn.net/v/t45.1600-4/567148251_25479897271611786_3815264377948223173_n.jpg?_nc_cat=111&ccb=1-7&_nc_sid=d5bd00&_nc_ohc=GicivGzRltoQ7kNvwFzbez-&_nc_oc=AdozZ6mhk3sRn-kn4YN6w2aUGemT8dwP71fBbm99EyECGmL2GKyLPwkebsEA3FshNL4&_nc_zt=1&_nc_ht=scontent-ams2-1.xx&edm=AJcBmwoEAAAA&_nc_gid=MU4VMEvawj6MN1z-ZFPOBg&_nc_tpa=Q5bMBQKxzxdaY3BRjLgs20uESPqgiAAlRbJ7lPrsCEV2qR1G_8hNhy7Mjgiz11YiqHGUfOH2fC3Idlydpg&oh=00_AQHm5-4jr3OyR0xa_PrbqxSBk890Kt77xb239pemvP3kZQ&oe=6A97AF9E";
const PREFIX = "SG Native Placement 2026-08-29";
const BODY = "We help Singaporeans who want to protect themselves from HIV with affordable PrEP access through doctors in Asia. Get PrEP now: register and place an order on prepsingapore.com, visit your preferred clinic after payment, and become PrEPed.";
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

function svgFeed() {
  return Buffer.from(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg">
    <rect x="55" y="55" width="970" height="185" rx="30" fill="rgba(255,255,255,0.94)"/>
    <text x="95" y="135" font-family="Arial,Helvetica,sans-serif" font-size="62" font-weight="700" fill="#d41f2f">PrEP Singapore</text>
    <text x="95" y="198" font-family="Arial,Helvetica,sans-serif" font-size="38" font-weight="500" fill="#191919">Be PrEPared for the good times</text>
    <rect x="55" y="895" width="970" height="395" rx="30" fill="rgba(255,255,255,0.95)"/>
    <text x="95" y="990" font-family="Arial,Helvetica,sans-serif" font-size="55" font-weight="700" fill="#191919">Affordable PrEP access</text>
    <text x="95" y="1055" font-family="Arial,Helvetica,sans-serif" font-size="38" fill="#333333">through doctors in Asia</text>
    <text x="95" y="1125" font-family="Arial,Helvetica,sans-serif" font-size="32" fill="#333333">Order online  •  Visit a clinic  •  Become PrEPed</text>
    <rect x="95" y="1170" width="660" height="82" rx="18" fill="#d41f2f"/>
    <text x="125" y="1225" font-family="Arial,Helvetica,sans-serif" font-size="38" font-weight="700" fill="white">prepsingapore.com</text>
  </svg>`);
}

function svgVertical() {
  return Buffer.from(`<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">
    <rect x="60" y="90" width="960" height="250" rx="34" fill="rgba(255,255,255,0.94)"/>
    <text x="105" y="185" font-family="Arial,Helvetica,sans-serif" font-size="76" font-weight="700" fill="#d41f2f">PrEP Singapore</text>
    <text x="105" y="275" font-family="Arial,Helvetica,sans-serif" font-size="47" font-weight="500" fill="#191919">Be PrEPared for the good times</text>
    <rect x="60" y="1030" width="960" height="720" rx="34" fill="rgba(255,255,255,0.96)"/>
    <text x="105" y="1140" font-family="Arial,Helvetica,sans-serif" font-size="64" font-weight="700" fill="#191919">Affordable PrEP access</text>
    <text x="105" y="1215" font-family="Arial,Helvetica,sans-serif" font-size="43" fill="#333333">through doctors in Asia</text>
    <text x="105" y="1325" font-family="Arial,Helvetica,sans-serif" font-size="42" font-weight="600" fill="#222222">1  Order online</text>
    <text x="105" y="1410" font-family="Arial,Helvetica,sans-serif" font-size="42" font-weight="600" fill="#222222">2  Visit your preferred clinic</text>
    <text x="105" y="1495" font-family="Arial,Helvetica,sans-serif" font-size="42" font-weight="600" fill="#222222">3  Become PrEPed</text>
    <rect x="105" y="1570" width="760" height="105" rx="22" fill="#d41f2f"/>
    <text x="145" y="1640" font-family="Arial,Helvetica,sans-serif" font-size="45" font-weight="700" fill="white">prepsingapore.com</text>
  </svg>`);
}

async function buildVariants(source) {
  const feedBg = await sharp(source).resize(1080, 1350, { fit: "cover" }).blur(35).modulate({ brightness: 0.66, saturation: 0.8 }).jpeg({ quality: 88 }).toBuffer();
  const feedHero = await sharp(source).resize(1080, null, { fit: "inside", withoutEnlargement: false }).jpeg({ quality: 94 }).toBuffer();
  const feed = await sharp(feedBg).composite([
    { input: feedHero, left: 0, top: 280 },
    { input: svgFeed(), left: 0, top: 0 }
  ]).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();

  const verticalBg = await sharp(source).resize(1080, 1920, { fit: "cover" }).blur(42).modulate({ brightness: 0.63, saturation: 0.78 }).jpeg({ quality: 88 }).toBuffer();
  const verticalHero = await sharp(source).resize(1080, null, { fit: "inside", withoutEnlargement: false }).jpeg({ quality: 94 }).toBuffer();
  const vertical = await sharp(verticalBg).composite([
    { input: verticalHero, left: 0, top: 405 },
    { input: svgVertical(), left: 0, top: 0 }
  ]).jpeg({ quality: 92, chromaSubsampling: "4:4:4" }).toBuffer();

  return { feed, vertical };
}

async function uploadImage(buffer, name) {
  const d = await graphPost(`${ACCOUNT_ID}/adimages`, { bytes: buffer.toString("base64"), name });
  const image = d.images && Object.values(d.images)[0];
  if (!image || !image.hash) throw Object.assign(new Error(`Meta did not return image hash for ${name}`), { meta: d });
  return image;
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-robots-tag", "noindex");
  if (!req.query || req.query.k !== KEY) return res.status(404).json({ ok:false });
  if (!process.env.META_ACCESS_TOKEN) return res.status(503).json({ ok:false, error:"META_ACCESS_TOKEN missing" });
  const phase = String(req.query.phase || "build");

  try {
    if (phase === "build") {
      const srcResponse = await fetch(SOURCE_IMAGE);
      if (!srcResponse.ok) throw new Error(`Source image fetch failed: ${srcResponse.status}`);
      const source = Buffer.from(await srcResponse.arrayBuffer());
      const { feed, vertical } = await buildVariants(source);
      const feedImage = await uploadImage(feed, "sg-native-feed-1080x1350-20260829.jpg");
      const verticalImage = await uploadImage(vertical, "sg-native-story-reels-1080x1920-20260829.jpg");

      const assetFeedSpec = {
        optimization_type: "PLACEMENT",
        ad_formats: ["SINGLE_IMAGE"],
        images: [
          { hash: feedImage.hash, adlabels: [{ name: "feed_4x5" }] },
          { hash: verticalImage.hash, adlabels: [{ name: "vertical_9x16" }] }
        ],
        bodies: [{ text: BODY, adlabels: [{ name: "body_main" }] }],
        titles: [{ text: "HIV Prevention is a reality", adlabels: [{ name: "title_main" }] }],
        descriptions: [{ text: "PREPSINGAPORE.COM" }],
        link_urls: [{ website_url: DESTINATION }],
        call_to_action_types: ["SEE_DETAILS"],
        asset_customization_rules: [
          {
            customization_spec: {
              publisher_platforms: ["facebook", "instagram"],
              facebook_positions: ["feed"],
              instagram_positions: ["stream"]
            },
            image_label: { name: "feed_4x5" },
            body_label: { name: "body_main" },
            title_label: { name: "title_main" },
            priority: 1
          },
          {
            customization_spec: {
              publisher_platforms: ["facebook", "instagram"],
              facebook_positions: ["story"],
              instagram_positions: ["story", "reels"]
            },
            image_label: { name: "vertical_9x16" },
            body_label: { name: "body_main" },
            title_label: { name: "title_main" },
            priority: 2
          }
        ]
      };

      const creative = await graphPost(`${ACCOUNT_ID}/adcreatives`, {
        name: `${PREFIX} | 4x5 + 9x16`,
        object_story_spec: { page_id: PAGE_ID, instagram_user_id: IG_ID },
        asset_feed_spec: assetFeedSpec
      });

      const ads = [];
      for (const [adsetId, name] of ADSETS) {
        const existing = await graphGet(`${adsetId}/ads`, { fields: "id,name,status,effective_status", limit: 100 });
        let ad = (existing.data || []).find(x => x.name === name);
        if (!ad) {
          const created = await graphPost(`${ACCOUNT_ID}/ads`, {
            name,
            adset_id: adsetId,
            creative: { creative_id: String(creative.id) },
            status: "PAUSED"
          });
          ad = { id: created.id, name, status: "PAUSED" };
        }
        ads.push({ adset_id: adsetId, ...ad });
      }

      return res.status(200).json({
        ok:true,
        phase,
        creative_id: creative.id,
        feed_image: { hash: feedImage.hash, width: 1080, height: 1350 },
        vertical_image: { hash: verticalImage.hash, width: 1080, height: 1920 },
        ads
      });
    }

    if (phase === "activate") {
      const results = [];
      for (const [adsetId, name] of ADSETS) {
        const existing = await graphGet(`${adsetId}/ads`, { fields: "id,name,status,effective_status,issues_info", limit: 100 });
        const ad = (existing.data || []).find(x => x.name === name);
        if (!ad) throw new Error(`Missing native placement ad: ${name}`);
        if (ad.issues_info && ad.issues_info.some(x => x.error_type === "HARD_ERROR")) {
          throw Object.assign(new Error(`Hard error on ${name}`), { meta: ad.issues_info });
        }
        const updated = await graphPost(String(ad.id), { status: "ACTIVE" });
        results.push({ adset_id: adsetId, ad_id: ad.id, name, before: ad.effective_status, updated });
      }
      return res.status(200).json({ ok:true, phase, ads: results });
    }

    return res.status(400).json({ ok:false, error:"phase must be build or activate" });
  } catch (e) {
    return res.status(500).json({ ok:false, phase, error:e.message, meta:e.meta || null });
  }
}
