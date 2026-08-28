import sharp from "sharp";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const KEY = "sgnative_20260829_7mK4cN2vP9";
const ACCOUNT_ID = "act_239740063602735";
const PAGE_ID = "1739278202817541";
const IG_ID = "17841407274095257";
const DESTINATION = "https://prepsingapore.com/";
const SOURCE_IMAGE = "https://scontent-ams2-1.xx.fbcdn.net/v/t45.1600-4/567148251_25479897271611786_3815264377948223173_n.jpg?_nc_cat=111&ccb=1-7&_nc_sid=d5bd00&_nc_ohc=GicivGzRltoQ7kNvwFzbez-&_nc_oc=AdozZ6mhk3sRn-kn4YN6w2aUGemT8dwP71fBbm99EyECGmL2GKyLPwkebsEA3FshNL4&_nc_zt=1&_nc_ht=scontent-ams2-1.xx&edm=AJcBmwoEAAAA&_nc_gid=MU4VMEvawj6MN1z-ZFPOBg&_nc_tpa=Q5bMBQKxzxdaY3BRjLgs20uESPqgiAAlRbJ7lPrsCEV2qR1G_8hNhy7Mjgiz11YiqHGUfOH2fC3Idlydpg&oh=00_AQHm5-4jr3OyR0xa_PrbqxSBk890Kt77xb239pemvP3kZQ&oe=6A97AF9E";
const PREFIX = "SG Native Placement v2 2026-08-29";
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

async function rounded(buffer, width, height, radius = 28) {
  const mask = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="white"/></svg>`);
  return sharp(buffer).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

async function buildVariants(source) {
  const hero = await sharp(source).resize(1080, null, { fit: "inside", withoutEnlargement: false }).sharpen().jpeg({ quality: 95 }).toBuffer();
  const heroMeta = await sharp(hero).metadata();

  const titleRaw = await sharp(source)
    .extract({ left: 245, top: 92, width: 365, height: 132 })
    .resize({ width: 900, fit: "inside" })
    .sharpen({ sigma: 1.1 })
    .jpeg({ quality: 96, chromaSubsampling: "4:4:4" })
    .toBuffer();
  const titleMeta = await sharp(titleRaw).metadata();
  const title = await rounded(titleRaw, titleMeta.width, titleMeta.height, 28);

  const feedBg = await sharp(source)
    .resize(1080, 1350, { fit: "cover" })
    .blur(38)
    .modulate({ brightness: 0.70, saturation: 0.72 })
    .jpeg({ quality: 88 })
    .toBuffer();
  const feed = await sharp(feedBg).composite([
    { input: title, left: Math.round((1080 - titleMeta.width) / 2), top: 95 },
    { input: hero, left: 0, top: 545 }
  ]).jpeg({ quality: 93, chromaSubsampling: "4:4:4" }).toBuffer();

  const verticalBg = await sharp(source)
    .resize(1080, 1920, { fit: "cover" })
    .blur(46)
    .modulate({ brightness: 0.68, saturation: 0.70 })
    .jpeg({ quality: 88 })
    .toBuffer();
  const vertical = await sharp(verticalBg).composite([
    { input: title, left: Math.round((1080 - titleMeta.width) / 2), top: 180 },
    { input: hero, left: 0, top: 610 }
  ]).jpeg({ quality: 93, chromaSubsampling: "4:4:4" }).toBuffer();

  return {
    feed,
    vertical,
    source_main_width: heroMeta.width,
    source_main_height: heroMeta.height,
    title_width: titleMeta.width,
    title_height: titleMeta.height
  };
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
      const variants = await buildVariants(source);
      const feedImage = await uploadImage(variants.feed, "sg-native-v2-feed-1080x1350-20260829.jpg");
      const verticalImage = await uploadImage(variants.vertical, "sg-native-v2-story-reels-1080x1920-20260829.jpg");

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
        name: `${PREFIX} | 4x5 + 9x16 source-safe`,
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
        preserved_source: {
          main_width: variants.source_main_width,
          main_height: variants.source_main_height,
          enlarged_title_width: variants.title_width,
          enlarged_title_height: variants.title_height
        },
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
