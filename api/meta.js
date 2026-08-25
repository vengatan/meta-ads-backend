const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function accessToken() {
  const value = process.env.META_ACCESS_TOKEN;
  if (!value) throw Object.assign(new Error("META_ACCESS_TOKEN is not configured"), { status: 503 });
  return value;
}

function normalizeAccountId(value) {
  if (!value) return null;
  const raw = String(value).trim();
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

function allowedAccounts() {
  return new Set(
    String(process.env.META_ALLOWED_ACCOUNTS || "")
      .split(",")
      .map(normalizeAccountId)
      .filter(Boolean)
  );
}

function requireAllowedAccount(value) {
  const accountId = normalizeAccountId(value);
  const allowed = allowedAccounts();
  if (!accountId) throw Object.assign(new Error("Missing account_id"), { status: 400 });
  if (allowed.size === 0) throw Object.assign(new Error("META_ALLOWED_ACCOUNTS is not configured; writes are disabled"), { status: 503 });
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
  if (!response.ok || data.error) {
    const error = Object.assign(new Error(data?.error?.message || `Meta GET failed (${response.status})`), {
      status: response.status || 400,
      meta: data?.error || data
    });
    throw error;
  }
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
  if (!response.ok || data.error) {
    const error = Object.assign(new Error(data?.error?.message || `Meta POST failed (${response.status})`), {
      status: response.status || 400,
      meta: data?.error || data
    });
    throw error;
  }
  return data;
}

async function objectAccount(objectId) {
  if (!/^\d+$/.test(String(objectId || ""))) throw Object.assign(new Error("Invalid Meta object id"), { status: 400 });
  const object = await graphGet(String(objectId), { fields: "account_id" });
  if (!object.account_id) throw Object.assign(new Error("Meta object does not expose account_id"), { status: 400 });
  return normalizeAccountId(object.account_id);
}

async function requireAllowedObject(objectId) {
  const accountId = await objectAccount(objectId);
  requireAllowedAccount(accountId);
  return accountId;
}

function getInput(req) {
  const q = req.query || {};
  const b = req.body && typeof req.body === "object" ? req.body : {};
  return { ...q, ...b };
}

function respondError(res, error) {
  return res.status(error.status || 500).json({
    ok: false,
    error: error.message,
    ...(error.meta ? { meta: error.meta } : {})
  });
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-robots-tag", "noindex");
  const input = getInput(req);
  const op = input.op || "health";

  try {
    if (op === "health") {
      return res.status(200).json({
        ok: true,
        service: "meta-ads-backend-vercel",
        graphVersion: GRAPH_VERSION,
        writesEnabled: allowedAccounts().size > 0,
        operations: ["permissions", "create_creative", "create_ad", "swap_ad_creative", "set_ad_status"]
      });
    }

    if (op === "permissions") {
      const [me, permissions] = await Promise.all([
        graphGet("me", { fields: "id,name" }),
        graphGet("me/permissions")
      ]);
      return res.status(200).json({ ok: true, me, permissions: permissions.data || [] });
    }

    if (op === "create_creative") {
      const accountId = requireAllowedAccount(input.account_id);
      const objectStorySpec = input.object_story_spec
        ? (typeof input.object_story_spec === "string" ? JSON.parse(input.object_story_spec) : input.object_story_spec)
        : undefined;
      if (!input.object_story_id && !objectStorySpec) {
        return res.status(400).json({ ok: false, error: "Provide object_story_id or object_story_spec" });
      }
      const data = await graphPost(`${accountId}/adcreatives`, {
        name: input.name || `GPT replacement creative ${new Date().toISOString()}`,
        ...(input.object_story_id ? { object_story_id: input.object_story_id } : {}),
        ...(objectStorySpec ? { object_story_spec: objectStorySpec } : {}),
        ...(input.url_tags ? { url_tags: input.url_tags } : {})
      });
      return res.status(200).json({ ok: true, creative_id: data.id });
    }

    if (op === "create_ad") {
      const accountId = requireAllowedAccount(input.account_id);
      if (!input.adset_id || !input.creative_id) return res.status(400).json({ ok: false, error: "Missing adset_id or creative_id" });
      const adsetAccount = await objectAccount(input.adset_id);
      if (adsetAccount !== accountId) return res.status(400).json({ ok: false, error: "Ad set does not belong to account_id" });
      const data = await graphPost(`${accountId}/ads`, {
        name: input.name || `GPT replacement ad ${new Date().toISOString()}`,
        adset_id: String(input.adset_id),
        creative: { creative_id: String(input.creative_id) },
        status: String(input.status || "PAUSED").toUpperCase() === "ACTIVE" ? "ACTIVE" : "PAUSED"
      });
      return res.status(200).json({ ok: true, ad_id: data.id });
    }

    if (op === "swap_ad_creative") {
      if (!input.ad_id || !/^\d+$/.test(String(input.ad_id))) return res.status(400).json({ ok: false, error: "Invalid ad_id" });
      if (!input.creative_id || !/^\d+$/.test(String(input.creative_id))) return res.status(400).json({ ok: false, error: "Invalid creative_id" });
      await requireAllowedObject(input.ad_id);
      const data = await graphPost(String(input.ad_id), { creative: { creative_id: String(input.creative_id) } });
      return res.status(200).json({ ok: true, ad_id: input.ad_id, creative_id: input.creative_id, meta: data });
    }

    if (op === "set_ad_status") {
      if (!input.ad_id || !/^\d+$/.test(String(input.ad_id))) return res.status(400).json({ ok: false, error: "Invalid ad_id" });
      const status = String(input.status || "").toUpperCase();
      if (!["ACTIVE", "PAUSED"].includes(status)) return res.status(400).json({ ok: false, error: "status must be ACTIVE or PAUSED" });
      await requireAllowedObject(input.ad_id);
      const data = await graphPost(String(input.ad_id), { status });
      return res.status(200).json({ ok: true, ad_id: input.ad_id, status, meta: data });
    }

    return res.status(400).json({ ok: false, error: `Unknown op: ${op}` });
  } catch (error) {
    return respondError(res, error);
  }
}
