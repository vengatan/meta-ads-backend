import crypto from "node:crypto";
import express from "express";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const ACCOUNT_ID = "act_239740063602735";
const CONTROL_CREATIVE_ID = "23851859866720178";
const REPAIR_ADSETS = [
  ["120247819803730179", "SG Profile Nightlife-EDM | Public control repair v2 2026-08-26"],
  ["120247819803050179", "SG Profile Dining-Cafe | Public control repair v2 2026-08-26"],
  ["120247819801930179", "SG Profile Tech-Finance | Public control repair v2 2026-08-26"]
];

function accessToken() {
  const value = process.env.META_ACCESS_TOKEN;
  if (!value) throw Object.assign(new Error("META_ACCESS_TOKEN is not configured"), { status: 503 });
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function repairKey() {
  return digest(`sg-lab-repair:${accessToken()}`);
}

function bridgeKey() {
  return process.env.META_BRIDGE_KEY || digest(`vensure-meta-bridge:${accessToken()}`);
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function requireRepairAuth(req) {
  if (!safeEqual(req.query?.k, repairKey())) throw Object.assign(new Error("Not found"), { status: 404 });
}

function requireCronAuth(req) {
  const configuredSecret = process.env.CRON_SECRET;
  const authorization = req.get("authorization") || "";
  if (configuredSecret) {
    if (!safeEqual(authorization, `Bearer ${configuredSecret}`)) {
      throw Object.assign(new Error("Unauthorized"), { status: 401 });
    }
    return;
  }

  const userAgent = req.get("user-agent") || "";
  if (!/^vercel-cron\//i.test(userAgent)) {
    throw Object.assign(new Error("Not found"), { status: 404 });
  }
}

function suppliedBridgeKey(req) {
  const direct = req.get("x-bridge-key");
  if (direct) return direct;
  const auth = req.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function requireBridgeAuth(req) {
  if (!safeEqual(suppliedBridgeKey(req), bridgeKey())) throw Object.assign(new Error("Unauthorized"), { status: 401 });
}

function paidOrderWebhookSecret() {
  const value = process.env.ZOHO_PAID_ORDER_WEBHOOK_SECRET;
  if (!value) throw Object.assign(new Error("ZOHO_PAID_ORDER_WEBHOOK_SECRET is not configured"), { status: 503 });
  return value;
}

function organizationSetting(mapName, fallbackName, organizationId) {
  const rawMap = String(process.env[mapName] || "").trim();
  if (rawMap) {
    let values;
    try {
      values = JSON.parse(rawMap);
    } catch {
      throw Object.assign(new Error(`${mapName} must be a JSON object`), { status: 503 });
    }
    if (!values || Array.isArray(values) || typeof values !== "object") {
      throw Object.assign(new Error(`${mapName} must be a JSON object`), { status: 503 });
    }
    return String(values[organizationId] || "").trim();
  }
  return String(process.env[fallbackName] || "").trim();
}

function stapeMetaCapiGatewayUrl(organizationId) {
  const raw = organizationSetting("STAPE_META_CAPI_GATEWAY_URLS_BY_ORG", "STAPE_META_CAPI_GATEWAY_URL", organizationId);
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error("STAPE_META_CAPI_GATEWAY_URL must be an HTTPS URL"), { status: 503 });
  }
  if (url.protocol !== "https:" || /(^|\.)facebook\.com$/i.test(url.hostname)) {
    throw Object.assign(new Error("STAPE_META_CAPI_GATEWAY_URL must point to the Stape gateway, not Meta Graph"), { status: 503 });
  }
  return url.toString();
}

function metaCapiTransport() {
  const value = String(process.env.META_CAPI_TRANSPORT || "stape").trim().toLowerCase();
  if (!new Set(["stape", "direct"]).has(value)) {
    throw Object.assign(new Error("META_CAPI_TRANSPORT must be stape or direct"), { status: 503 });
  }
  return value;
}

function metaAccessToken(organizationId) {
  return organizationSetting("META_ACCESS_TOKENS_BY_ORG", "META_ACCESS_TOKEN", organizationId);
}

async function postDirectMetaCapi(events, organizationId, pixelId) {
  const token = metaAccessToken(organizationId);
  if (!token) return null;
  const response = await fetch(`${GRAPH_BASE}/${encodeURIComponent(pixelId)}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: events, access_token: token })
  });
  const data = await parseJson(response);
  if (!response.ok || data.error) {
    throw Object.assign(new Error(data?.error?.message || `Meta CAPI delivery failed (${response.status})`), { status: 502, meta: data?.error || data });
  }
  return data;
}

async function postStapeMetaCapi(events, organizationId) {
  const gatewayUrl = stapeMetaCapiGatewayUrl(organizationId);
  if (!gatewayUrl) return null;
  const gatewayToken = String(process.env.STAPE_META_CAPI_GATEWAY_TOKEN || "").trim();
  const response = await fetch(gatewayUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(gatewayToken ? { authorization: `Bearer ${gatewayToken}` } : {})
    },
    // The gateway receives the standard Meta CAPI envelope. The access token
    // remains server-side and is never sent to the browser or Zoho.
    body: JSON.stringify({ data: events, access_token: accessToken() })
  });
  const data = await parseJson(response);
  if (!response.ok || data.error) {
    throw Object.assign(new Error(data?.error?.message || `Stape Meta CAPI delivery failed (${response.status})`), { status: 502, meta: data?.error || data });
  }
  return data;
}

function requirePaidOrderWebhookAuth(req) {
  const supplied = req.get("x-zoho-paid-order-secret") || suppliedBridgeKey(req);
  if (!safeEqual(supplied, paidOrderWebhookSecret())) throw Object.assign(new Error("Unauthorized"), { status: 401 });
}

function parsePaidOrder(payload) {
  const organizationId = String(payload?.organization_id || "").trim();
  const salesOrderId = String(payload?.salesorder_id || "").trim();
  // `response_order_number` is the sole attribution join key. It is the
  // Google response Sheet's Order Number, not Zoho's salesorder_number.
  // The aliases keep the existing Zoho function working during migration.
  const responseOrderNumber = String(payload?.response_order_number || payload?.reference_number || payload?.order_number || "").trim();
  const paidStatus = String(payload?.paid_status || "").trim().toLowerCase();
  const currency = String(payload?.currency || "").trim().toUpperCase();
  const amount = Number(payload?.amount);
  const paidAt = String(payload?.paid_at || "").trim();

  if (!/^\d+$/.test(organizationId) || !/^\d+$/.test(salesOrderId) || !responseOrderNumber || responseOrderNumber.length > 100) {
    throw Object.assign(new Error("organization_id, salesorder_id, and response_order_number are required"), { status: 400 });
  }
  const allowedZohoOrganizations = new Set(
    String(process.env.ZOHO_ORGANIZATION_IDS || process.env.ZOHO_ORGANIZATION_ID || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  if (!allowedZohoOrganizations.has(organizationId)) {
    throw Object.assign(new Error("Zoho organization is not allowed"), { status: 403 });
  }
  if (paidStatus !== "paid") throw Object.assign(new Error("Sales Order is not paid"), { status: 409 });
  if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) {
    throw Object.assign(new Error("amount must be positive and currency must be an ISO 4217 code"), { status: 400 });
  }
  if (paidAt && Number.isNaN(Date.parse(paidAt))) throw Object.assign(new Error("paid_at must be an ISO date-time when supplied"), { status: 400 });

  const eventId = digest(`zoho-paid-order:${organizationId}:${salesOrderId}`);
  return {
    organizationId,
    salesOrderId,
    responseOrderNumber,
    amount,
    currency,
    paidAt: paidAt || new Date().toISOString(),
    eventId,
    gaClientId: typeof payload?.ga_client_id === "string" ? payload.ga_client_id.trim() : "",
    fbp: typeof payload?.fbp === "string" ? payload.fbp.trim() : "",
    fbc: typeof payload?.fbc === "string" ? payload.fbc.trim() : ""
  };
}

async function sendPaidOrderConversions(order) {
  if (process.env.PAID_CONVERSION_DELIVERY_ENABLED !== "true") {
    return { mode: "disabled", reason: "PAID_CONVERSION_DELIVERY_ENABLED is not true" };
  }

  const results = {};
  const ga4MeasurementId = organizationSetting("GA4_MEASUREMENT_IDS_BY_ORG", "GA4_MEASUREMENT_ID", order.organizationId);
  const ga4ApiSecret = organizationSetting("GA4_API_SECRETS_BY_ORG", "GA4_API_SECRET", order.organizationId);
  if (ga4MeasurementId && ga4ApiSecret && order.gaClientId) {
    const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(ga4MeasurementId)}&api_secret=${encodeURIComponent(ga4ApiSecret)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: order.gaClientId,
        events: [{
          name: "purchase",
          params: {
            transaction_id: order.eventId,
            value: order.amount,
            currency: order.currency,
            engagement_time_msec: 1
          }
        }]
      })
    });
    if (!response.ok) throw Object.assign(new Error(`GA4 purchase delivery failed (${response.status})`), { status: 502 });
    results.ga4 = "sent";
  } else {
    results.ga4 = "skipped: GA4 credentials or ga_client_id are missing";
  }

  const pixelId = organizationSetting("META_PIXEL_IDS_BY_ORG", "META_PIXEL_ID", order.organizationId);
  const transport = metaCapiTransport();
  const destinationReady = transport === "direct"
    ? Boolean(metaAccessToken(order.organizationId))
    : Boolean(stapeMetaCapiGatewayUrl(order.organizationId));
  if (pixelId && destinationReady && (order.fbp || order.fbc)) {
    const events = [{
        event_name: "Purchase",
        event_time: Math.floor(Date.parse(order.paidAt) / 1000),
        event_id: order.eventId,
        action_source: "website",
        event_source_url: organizationSetting("PAID_ORDER_EVENT_SOURCE_URLS_BY_ORG", "PAID_ORDER_EVENT_SOURCE_URL", order.organizationId) || "https://preptaiwan.org/",
        user_data: {
          ...(order.fbp ? { fbp: order.fbp } : {}),
          ...(order.fbc ? { fbc: order.fbc } : {})
        },
        custom_data: { value: order.amount, currency: order.currency }
      }];
    const data = transport === "direct"
      ? await postDirectMetaCapi(events, order.organizationId, pixelId)
      : await postStapeMetaCapi(events, order.organizationId);
    if (!data.events_received) throw Object.assign(new Error("Meta purchase delivery was not accepted"), { status: 502 });
    results.meta = `sent:${transport}`;
  } else {
    results.meta = `skipped: META_PIXEL_ID, ${transport === "direct" ? "META_ACCESS_TOKEN" : "STAPE_META_CAPI_GATEWAY_URL"}, or Meta browser/click ID is missing`;
  }

  return {
    mode: "enabled",
    complete: results.ga4 === "sent" && /^sent:/.test(results.meta || ""),
    results
  };
}

function normalizeAccountId(value) {
  if (!value) return null;
  const raw = String(value).trim();
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

function allowedAccounts() {
  return new Set(String(process.env.META_ALLOWED_ACCOUNTS || "").split(",").map(normalizeAccountId).filter(Boolean));
}

function requireAllowedAccount(value) {
  const accountId = normalizeAccountId(value);
  const allowed = allowedAccounts();
  if (!accountId) throw Object.assign(new Error("Missing account_id"), { status: 400 });
  if (!allowed.size) throw Object.assign(new Error("META_ALLOWED_ACCOUNTS is not configured; writes are disabled"), { status: 503 });
  if (!allowed.has(accountId)) throw Object.assign(new Error(`Account not allowed: ${accountId}`), { status: 403 });
  return accountId;
}

async function parseJson(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function graphGet(path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) qs.set(k, String(v));
  qs.set("access_token", accessToken());
  const response = await fetch(`${GRAPH_BASE}/${path}?${qs.toString()}`);
  const data = await parseJson(response);
  if (!response.ok || data.error) throw Object.assign(new Error(data?.error?.message || `Meta GET failed (${response.status})`), { status: response.status || 400, meta: data?.error || data });
  return data;
}

async function graphPost(path, params = {}) {
  const body = new URLSearchParams();
  body.set("access_token", accessToken());
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const response = await fetch(`${GRAPH_BASE}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await parseJson(response);
  if (!response.ok || data.error) throw Object.assign(new Error(data?.error?.message || `Meta POST failed (${response.status})`), { status: response.status || 400, meta: data?.error || data });
  return data;
}

async function objectAccount(objectId) {
  const object = await graphGet(String(objectId), { fields: "account_id" });
  if (!object.account_id) throw Object.assign(new Error("Meta object does not expose account_id"), { status: 400 });
  return normalizeAccountId(object.account_id);
}

async function requireAllowedObject(objectId) {
  const accountId = await objectAccount(objectId);
  requireAllowedAccount(accountId);
  return accountId;
}

function sendError(res, error) {
  console.error("meta-ads-backend error", {
    message: error?.message,
    status: error?.status,
    metaCode: error?.meta?.code,
    metaSubcode: error?.meta?.error_subcode
  });
  return res.status(error.status || 500).json({ ok: false, error: error.message, ...(error.meta ? { meta: error.meta } : {}) });
}

async function listRepairAds() {
  const results = [];
  for (const [adsetId, name] of REPAIR_ADSETS) {
    const existing = await graphGet(`${adsetId}/ads`, { fields: "id,name,status,effective_status,creative,issues_info", limit: 100 });
    const found = (existing.data || []).find((ad) => ad.name === name) || null;
    results.push({ adset_id: adsetId, expected_name: name, ad: found });
  }
  return results;
}

async function findOrCreateRepairAds() {
  requireAllowedAccount(ACCOUNT_ID);
  const controlCreative = await graphGet(CONTROL_CREATIVE_ID, { fields: "id,name,effective_object_story_id" });
  if (String(controlCreative.id || "") !== CONTROL_CREATIVE_ID) {
    throw Object.assign(new Error("Control creative validation failed"), { status: 409 });
  }

  const results = [];
  for (const [adsetId, name] of REPAIR_ADSETS) {
    const existing = await graphGet(`${adsetId}/ads`, { fields: "id,name,status,effective_status,creative,issues_info", limit: 100 });
    const found = (existing.data || []).find((ad) => ad.name === name);
    if (found) {
      results.push({ adset_id: adsetId, existing: true, ...found });
      continue;
    }

    const created = await graphPost(`${ACCOUNT_ID}/ads`, {
      name,
      adset_id: adsetId,
      creative: { creative_id: CONTROL_CREATIVE_ID },
      status: "PAUSED"
    });
    results.push({ adset_id: adsetId, existing: false, ad_id: created.id, status: "PAUSED" });
  }
  return results;
}

async function ensureRepairAdsActive() {
  await findOrCreateRepairAds();
  const current = await listRepairAds();
  const changed = [];

  for (const row of current) {
    const ad = row.ad;
    if (!ad) throw Object.assign(new Error(`Replacement ad missing for ${row.adset_id}`), { status: 409 });
    if (String(ad.creative?.id || "") !== CONTROL_CREATIVE_ID) {
      throw Object.assign(new Error(`Unexpected creative on replacement ad ${ad.id}`), { status: 409 });
    }
    if (ad.status !== "ACTIVE") {
      await graphPost(ad.id, { status: "ACTIVE" });
    }
    changed.push({
      adset_id: row.adset_id,
      ad_id: ad.id,
      previous_status: ad.status,
      previous_effective_status: ad.effective_status,
      requested_status: "ACTIVE",
      creative_id: ad.creative?.id
    });
  }

  return changed;
}

app.get(["/", "/api/ping"], (req, res) => {
  res.set("cache-control", "no-store");
  return res.status(200).json({ ok: true, service: "meta-ads-backend", runtime: "vercel-express", graphVersion: GRAPH_VERSION });
});

app.get("/api/meta", async (req, res) => {
  res.set("cache-control", "no-store");
  const op = typeof req.query.op === "string" ? req.query.op : "health";
  try {
    if (op === "health") {
      return res.status(200).json({ ok: true, service: "meta-ads-backend", runtime: "vercel-express", graphVersion: GRAPH_VERSION, writesConfigured: allowedAccounts().size > 0 });
    }
    requireBridgeAuth(req);
    if (op === "permissions") {
      const [me, permissions] = await Promise.all([graphGet("me", { fields: "id,name" }), graphGet("me/permissions")]);
      return res.status(200).json({ ok: true, me, permissions: permissions.data || [] });
    }
    if (op === "insights") {
      const accountId = requireAllowedAccount(req.query.account_id);
      const level = typeof req.query.level === "string" ? req.query.level : "campaign";
      if (!["campaign", "adset", "ad"].includes(level)) {
        return res.status(400).json({ ok: false, error: "level must be campaign, adset, or ad" });
      }

      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      const today = new Date();
      const defaultUntil = today.toISOString().slice(0, 10);
      const defaultSince = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const since = typeof req.query.since === "string" ? req.query.since : defaultSince;
      const until = typeof req.query.until === "string" ? req.query.until : defaultUntil;
      if (!datePattern.test(since) || !datePattern.test(until) || Number.isNaN(Date.parse(`${since}T00:00:00Z`)) || Number.isNaN(Date.parse(`${until}T00:00:00Z`))) {
        return res.status(400).json({ ok: false, error: "since and until must be valid YYYY-MM-DD dates" });
      }
      const elapsedDays = (Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86400000;
      if (elapsedDays < 0 || elapsedDays > 92) {
        return res.status(400).json({ ok: false, error: "Date range must be between 0 and 92 days" });
      }

      const insights = await graphGet(`${accountId}/insights`, {
        fields: "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,action_values,cost_per_action_type",
        level,
        time_range: JSON.stringify({ since, until }),
        limit: 100
      });
      return res.status(200).json({
        ok: true,
        account_id: accountId,
        level,
        date_range: { since, until },
        data: insights.data || [],
        has_more: Boolean(insights.paging?.next)
      });
    }
    return res.status(400).json({ ok: false, error: `Unknown GET op: ${op}` });
  } catch (error) {
    return sendError(res, error);
  }
});


app.get("/api/insights", async (req, res) => {
  // Vercel Deployment Protection requires a signed-in Vercel team member before this function runs.
  res.set("cache-control", "no-store");
  try {
    const accountId = requireAllowedAccount(req.query.account_id || ACCOUNT_ID);
    const level = typeof req.query.level === "string" ? req.query.level : "campaign";
    if (!["campaign", "adset", "ad"].includes(level)) {
      return res.status(400).json({ ok: false, error: "level must be campaign, adset, or ad" });
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const today = new Date();
    const defaultUntil = today.toISOString().slice(0, 10);
    const defaultSince = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const since = typeof req.query.since === "string" ? req.query.since : defaultSince;
    const until = typeof req.query.until === "string" ? req.query.until : defaultUntil;
    if (!datePattern.test(since) || !datePattern.test(until) || Number.isNaN(Date.parse(`${since}T00:00:00Z`)) || Number.isNaN(Date.parse(`${until}T00:00:00Z`))) {
      return res.status(400).json({ ok: false, error: "since and until must be valid YYYY-MM-DD dates" });
    }
    const elapsedDays = (Date.parse(`${until}T00:00:00Z`) - Date.parse(`${since}T00:00:00Z`)) / 86400000;
    if (elapsedDays < 0 || elapsedDays > 92) {
      return res.status(400).json({ ok: false, error: "Date range must be between 0 and 92 days" });
    }

    const insights = await graphGet(`${accountId}/insights`, {
      fields: "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,action_values,cost_per_action_type",
      level,
      time_range: JSON.stringify({ since, until }),
      limit: 100
    });
    return res.status(200).json({
      ok: true,
      account_id: accountId,
      level,
      date_range: { since, until },
      data: insights.data || [],
      has_more: Boolean(insights.paging?.next)
    });
  } catch (error) {
    return sendError(res, error);
  }
});

app.get("/api/zoho/paid-order/config", async (req, res) => {
  res.set("cache-control", "no-store");
  try {
    requirePaidOrderWebhookAuth(req);
    const organizationIds = String(process.env.ZOHO_ORGANIZATION_IDS || process.env.ZOHO_ORGANIZATION_ID || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const organizations = [];
    for (const organizationId of organizationIds) {
      const pixelId = organizationSetting("META_PIXEL_IDS_BY_ORG", "META_PIXEL_ID", organizationId);
      const token = metaAccessToken(organizationId);
      let metaAccessible = false;
      let metaError = null;
      if (pixelId && token) {
        const response = await fetch(`${GRAPH_BASE}/${encodeURIComponent(pixelId)}?fields=id&access_token=${encodeURIComponent(token)}`);
        const data = await parseJson(response);
        metaAccessible = response.ok && data.id === pixelId;
        if (!metaAccessible) metaError = data?.error?.message || `Meta check failed (${response.status})`;
      }
      organizations.push({
        organization_id: organizationId,
        pixel_id: pixelId || null,
        meta_token_configured: Boolean(token),
        meta_accessible: metaAccessible,
        meta_error: metaError,
        event_source_url_configured: Boolean(organizationSetting("PAID_ORDER_EVENT_SOURCE_URLS_BY_ORG", "PAID_ORDER_EVENT_SOURCE_URL", organizationId))
      });
    }
    return res.status(200).json({
      ok: true,
      delivery_enabled: process.env.PAID_CONVERSION_DELIVERY_ENABLED === "true",
      meta_transport: metaCapiTransport(),
      ga4_configured: Boolean(
        (process.env.GA4_MEASUREMENT_ID && process.env.GA4_API_SECRET) ||
        (process.env.GA4_MEASUREMENT_IDS_BY_ORG && process.env.GA4_API_SECRETS_BY_ORG)
      ),
      organizations
    });
  } catch (error) {
    return sendError(res, error);
  }
});

app.post("/api/zoho/paid-order", async (req, res) => {
  res.set("cache-control", "no-store");
  try {
    requirePaidOrderWebhookAuth(req);
    const order = parsePaidOrder(req.body);
    const delivery = await sendPaidOrderConversions(order);
    console.log("Zoho paid-order conversion processed", {
      salesOrderId: order.salesOrderId,
      responseOrderNumber: order.responseOrderNumber,
      eventId: order.eventId,
      deliveryMode: delivery.mode
    });
    return res.status(200).json({ ok: true, event_id: order.eventId, delivery });
  } catch (error) {
    return sendError(res, error);
  }
});

app.post("/api/meta", async (req, res) => {
  res.set("cache-control", "no-store");
  try {
    requireBridgeAuth(req);
    const op = String(req.body?.op || req.query?.op || "");

    if (op === "create_ad") {
      const accountId = requireAllowedAccount(req.body.account_id);
      const { adset_id, creative_id, name } = req.body;
      if (!adset_id || !creative_id) return res.status(400).json({ ok: false, error: "Missing adset_id or creative_id" });
      if (await objectAccount(adset_id) !== accountId) return res.status(400).json({ ok: false, error: "Ad set does not belong to account_id" });
      const data = await graphPost(`${accountId}/ads`, { name: name || `GPT replacement ad ${new Date().toISOString()}`, adset_id: String(adset_id), creative: { creative_id: String(creative_id) }, status: "PAUSED" });
      return res.status(200).json({ ok: true, ad_id: data.id, status: "PAUSED" });
    }

    if (op === "set_ad_status") {
      const adId = String(req.body.ad_id || "");
      const status = String(req.body.status || "").toUpperCase();
      if (!/^\d+$/.test(adId) || !["ACTIVE", "PAUSED"].includes(status)) return res.status(400).json({ ok: false, error: "Invalid ad_id or status" });
      await requireAllowedObject(adId);
      const data = await graphPost(adId, { status });
      return res.status(200).json({ ok: true, ad_id: adId, status, meta: data });
    }

    return res.status(400).json({ ok: false, error: `Unknown POST op: ${op}` });
  } catch (error) {
    return sendError(res, error);
  }
});

app.get("/api/repair-sg-lab", async (req, res) => {
  res.set("cache-control", "no-store");
  try {
    requireRepairAuth(req);
    const ads = await findOrCreateRepairAds();
    return res.status(200).json({ ok: true, account_id: ACCOUNT_ID, creative_id: CONTROL_CREATIVE_ID, ads });
  } catch (error) {
    return sendError(res, error);
  }
});

app.get("/api/repair-sg-lab/activate", async (req, res) => {
  res.set("cache-control", "no-store");
  try {
    requireRepairAuth(req);
    const changed = await ensureRepairAdsActive();
    return res.status(200).json({ ok: true, changed });
  } catch (error) {
    return sendError(res, error);
  }
});

app.get("/api/cron-repair-sg", async (req, res) => {
  res.set("cache-control", "no-store");
  try {
    requireCronAuth(req);
    const changed = await ensureRepairAdsActive();
    const current = await listRepairAds();
    console.log("SG Meta lab cron repair completed", {
      ads: current.map((row) => ({
        adset_id: row.adset_id,
        ad_id: row.ad?.id,
        status: row.ad?.status,
        effective_status: row.ad?.effective_status,
        creative_id: row.ad?.creative?.id
      }))
    });
    return res.status(200).json({ ok: true, changed, current });
  } catch (error) {
    return sendError(res, error);
  }
});

export default app;
