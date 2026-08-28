import sharp from "sharp";

if (process.env.VERCEL && process.env.VERCEL_ENV !== "production") {
  console.log("SG native v2: non-production build, skipped");
  process.exit(0);
}

const TOKEN = process.env.META_ACCESS_TOKEN;
if (!TOKEN) {
  console.log("SG native v2: META_ACCESS_TOKEN not available in build environment, skipped");
  process.exit(0);
}

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function parse(r) {
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function graphGet(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k,v] of Object.entries(params)) qs.set(k, String(v));
  qs.set("access_token", TOKEN);
  const r = await fetch(`${GRAPH_BASE}/${path}?${qs}`);
  const d = await parse(r);
  if (!r.ok || d.error) throw Object.assign(new Error((d.error && d.error.message) || `GET ${r.status}`), { meta: d.error || d });
  return d;
}

async function graphPost(path, params = {}) {
  const body = new URLSearchParams();
  body.set("access_token", TOKEN);
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
  const titleRaw = await sharp(source)
    .extract({ left: 245, top: 92, width: 365, height: 132 })
    .resize({ width: 900, fit: "inside" })
    .sharpen({ sigma: 1.1 })
    .jpeg({ quality: 96, chromaSubsampling: "4:4:4" })
    .toBuffer();
  const titleMeta = await sharp(titleRaw).metadata();
  const title = await rounded(titleRaw, titleMeta.width, titleMeta.height, 28);

  const feedBg = await sharp(source).resize(1080, 1350, { fit: "cover" }).blur(38).modulate({ brightness: 0.70, saturation: 0.72 }).jpeg({ quality: 88 }).toBuffer();
  const feed = await sharp(feedBg).composite([
    { input: title, left: Math.round((1080 - titleMeta.width) / 2), top: 95 },
    { input: hero, left: 0, top: 545 }
  ]).jpeg({ quality: 93, chromaSubsampling: "4:4:4" }).toBuffer();

  const verticalBg = await sharp(source).resize(1080, 1920, { fit: "cover" }).blur(46).modulate({ brightness: 0.68, saturation: 0.70 }).jpeg({ quality: 88 }).toBuffer();
  const vertical = await sharp(verticalBg).composite([
    { input: title, left: Math.round((1080 - titleMeta.width) / 2), top: 180 },
    { input: hero, left: 0, top: 610 }
  ]).jpeg({ quality: 93, chromaSubsampling: "4:4:4" }).toBuffer();

  return { feed, vertical };
}

async function uploadImage(buffer, name) {
  const d = await graphPost(`${ACCOUNT_ID}/adimages`, { bytes: buffer.toString("base64"), name });
  const image = d.images && Object.values(d.images)[0];
  if (!image || !image.hash) throw new Error(`No image hash returned for ${name}`);
  return image.hash;
}

async function findExisting() {
  const found = [];
  for (const [adsetId, name] of ADSETS) {
    const d = await graphGet(`${adsetId}/ads`, { fields: "id,name,status,effective_status,issues_info", limit: 100 });
    const ad = (d.data || []).find(x => x.name === name);
    found.push(ad ? { adsetId, name, ad } : { adsetId, name, ad: null });
  }
  return found;
}

async function activateIfClean(found) {
  let hasHard = false;
  for (const item of found) {
    const detail = item.ad && await graphGet(String(item.ad.id), { fields: "id,name,status,effective_status,issues_info" });
    const hard = (detail && detail.issues_info || []).filter(x => x.error_type === "HARD_ERROR");
    if (hard.length) {
      hasHard = true;
      console.log(`SG native v2: ${item.name} has hard Meta issue ${hard.map(x => x.error_code).join(",")}; left paused`);
    }
  }
  if (hasHard) return false;

  for (const item of found) {
    await graphPost(String(item.ad.id), { status: "ACTIVE" });
    console.log(`SG native v2: activated ${item.name} (${item.ad.id})`);
  }
  return true;
}

try {
  let found = await findExisting();
  if (found.every(x => x.ad)) {
    console.log("SG native v2: ads already exist; validating before activation");
    await activateIfClean(found);
    process.exit(0);
  }

  const src = await fetch(SOURCE_IMAGE);
  if (!src.ok) throw new Error(`Source image fetch failed ${src.status}`);
  const source = Buffer.from(await src.arrayBuffer());
  const { feed, vertical } = await buildVariants(source);
  const feedHash = await uploadImage(feed, "sg-native-v2-feed-1080x1350-20260829.jpg");
  const verticalHash = await uploadImage(vertical, "sg-native-v2-story-reels-1080x1920-20260829.jpg");

  const assetFeedSpec = {
    optimization_type: "PLACEMENT",
    ad_formats: ["SINGLE_IMAGE"],
    images: [
      { hash: feedHash, adlabels: [{ name: "feed_4x5" }] },
      { hash: verticalHash, adlabels: [{ name: "vertical_9x16" }] }
    ],
    bodies: [{ text: BODY, adlabels: [{ name: "body_main" }] }],
    titles: [{ text: "HIV Prevention is a reality", adlabels: [{ name: "title_main" }] }],
    descriptions: [{ text: "PREPSINGAPORE.COM" }],
    link_urls: [{ website_url: DESTINATION }],
    call_to_action_types: ["SEE_DETAILS"],
    asset_customization_rules: [
      {
        customization_spec: { publisher_platforms: ["facebook","instagram"], facebook_positions: ["feed"], instagram_positions: ["stream"] },
        image_label: { name: "feed_4x5" }, body_label: { name: "body_main" }, title_label: { name: "title_main" }, priority: 1
      },
      {
        customization_spec: { publisher_platforms: ["facebook","instagram"], facebook_positions: ["story"], instagram_positions: ["story","reels"] },
        image_label: { name: "vertical_9x16" }, body_label: { name: "body_main" }, title_label: { name: "title_main" }, priority: 2
      }
    ]
  };

  const creative = await graphPost(`${ACCOUNT_ID}/adcreatives`, {
    name: `${PREFIX} | 4x5 + 9x16 source-safe`,
    object_story_spec: { page_id: PAGE_ID, instagram_user_id: IG_ID },
    asset_feed_spec: assetFeedSpec
  });
  console.log(`SG native v2: creative created ${creative.id}`);

  for (const [adsetId, name] of ADSETS) {
    const current = await graphGet(`${adsetId}/ads`, { fields: "id,name,status,effective_status", limit: 100 });
    if ((current.data || []).some(x => x.name === name)) continue;
    const ad = await graphPost(`${ACCOUNT_ID}/ads`, { name, adset_id: adsetId, creative: { creative_id: String(creative.id) }, status: "PAUSED" });
    console.log(`SG native v2: paused ad created ${name} (${ad.id})`);
  }

  await sleep(1800);
  found = await findExisting();
  if (!found.every(x => x.ad)) throw new Error("Not all SG native v2 ads could be found after creation");
  const activated = await activateIfClean(found);
  console.log(`SG native v2: completed; activated=${activated}`);
} catch (e) {
  console.error(`SG native v2: ${e.message}`);
  if (e.meta) console.error(`SG native v2 Meta code: ${e.meta.code || "unknown"}/${e.meta.error_subcode || ""}`);
  process.exitCode = 0;
}
