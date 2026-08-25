import crypto from "node:crypto";
import express from "express";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const ACCOUNT_ID = "act_239740063602735";
const CONTROL_CREATIVE_ID = "1677420986472049";
const REPAIR_ADSETS = [
  ["120247819803730179", "SG Profile Nightlife-EDM | Control repair 2026-08-26"],
  ["120247819803050179", "SG Profile Dining-Cafe | Control repair 2026-08-26"],
  ["120247819801930179", "SG Profile Tech-Finance | Control repair 2026-08-26"]
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

function suppliedBridgeKey(req) {
  const direct = req.get("x-bridge-key");
  if (direct) return direct;
  const auth = req.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function requireBridgeAuth(req) {
  if (!safeEqual(suppliedBridgeKey(req), bridgeKey())) throw Object.assign(new Error("Unauthorized"), { status: 401 });
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
  return res.status(error.status || 500).json({ ok: false, error: error.message, ...(error.meta ? { meta: error.meta } : {}) });
}

async function findOrCreateRepairAds() {
  requireAllowedAccount(ACCOUNT_ID);
  await graphGet(CONTROL_CREATIVE_ID, { fields: "id,name" });
  const results = [];

  for (const [adsetId, name] of REPAIR_ADSETS) {
    const existing = await graphGet(`${adsetId}/ads`, { fields: "id,name,status,effective_status,creative", limit: 100 });
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
    return res.status(400).json({ ok: false, error: `Unknown GET op: ${op}` });
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
    requireAllowedAccount(ACCOUNT_ID);
    const changed = [];
    for (const [adsetId, name] of REPAIR_ADSETS) {
      const existing = await graphGet(`${adsetId}/ads`, { fields: "id,name,status,effective_status,creative", limit: 100 });
      const ad = (existing.data || []).find((row) => row.name === name);
      if (!ad) throw Object.assign(new Error(`Replacement ad missing for ${adsetId}`), { status: 409 });
      if (String(ad.creative?.id || "") !== CONTROL_CREATIVE_ID) throw Object.assign(new Error(`Unexpected creative on ${ad.id}`), { status: 409 });
      if (ad.status !== "ACTIVE") await graphPost(ad.id, { status: "ACTIVE" });
      changed.push({ adset_id: adsetId, ad_id: ad.id, previous_status: ad.status, requested_status: "ACTIVE" });
    }
    return res.status(200).json({ ok: true, changed });
  } catch (error) {
    return sendError(res, error);
  }
});

export default app;
