import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json({ limit: "1mb" }));

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v25.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function token() {
  const value = process.env.META_ACCESS_TOKEN;
  if (!value) throw new Error("META_ACCESS_TOKEN is not configured");
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
      .map((v) => normalizeAccountId(v))
      .filter(Boolean)
  );
}

function requireAllowedAccount(accountId) {
  const normalized = normalizeAccountId(accountId);
  const allowed = allowedAccounts();
  if (!normalized) throw new Error("Missing account_id");
  if (allowed.size === 0) {
    const err = new Error("META_ALLOWED_ACCOUNTS is not configured; writes are disabled");
    err.status = 503;
    throw err;
  }
  if (!allowed.has(normalized)) {
    const err = new Error(`Account not allowed: ${normalized}`);
    err.status = 403;
    throw err;
  }
  return normalized;
}

async function graphGet(path, params = {}) {
  const qs = new URLSearchParams({ ...params, access_token: token() });
  const response = await fetch(`${GRAPH_BASE}/${path}?${qs.toString()}`);
  const data = await response.json();
  if (!response.ok || data.error) {
    const err = new Error(data?.error?.message || `Meta GET failed (${response.status})`);
    err.status = response.status || 400;
    err.meta = data?.error || data;
    throw err;
  }
  return data;
}

async function graphPost(path, params = {}) {
  const body = new URLSearchParams();
  body.set("access_token", token());
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }

  const response = await fetch(`${GRAPH_BASE}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    const err = new Error(data?.error?.message || `Meta POST failed (${response.status})`);
    err.status = response.status || 400;
    err.meta = data?.error || data;
    throw err;
  }
  return data;
}

async function accountForObject(objectId) {
  if (!/^\d+$/.test(String(objectId || ""))) {
    const err = new Error("Invalid Meta object id");
    err.status = 400;
    throw err;
  }
  const object = await graphGet(String(objectId), { fields: "account_id" });
  if (!object.account_id) {
    const err = new Error("Meta object does not expose account_id");
    err.status = 400;
    throw err;
  }
  return normalizeAccountId(object.account_id);
}

async function requireAllowedObject(objectId) {
  const accountId = await accountForObject(objectId);
  requireAllowedAccount(accountId);
  return accountId;
}

function sendError(res, err) {
  res.status(err.status || 500).json({
    ok: false,
    error: err.message,
    ...(err.meta ? { meta: err.meta } : {})
  });
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "meta-ads-backend",
    graphVersion: GRAPH_VERSION,
    writesEnabled: allowedAccounts().size > 0,
    writeOperations: ["create_creative", "create_ad", "swap_ad_creative", "set_ad_status"]
  });
});

app.get("/insights", async (req, res) => {
  try {
    const accountId = normalizeAccountId(req.query.account_id);
    if (!accountId) return res.status(400).json({ error: "Missing account_id" });

    const params = {
      fields: req.query.fields || "campaign_name,adset_name,spend,impressions,clicks,ctr,cpc",
      date_preset: req.query.date_preset || "last_7d"
    };
    if (req.query.level) params.level = req.query.level;

    const data = await graphGet(`${accountId}/insights`, params);
    res.json(data);
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/permissions", async (req, res) => {
  try {
    const [me, permissions] = await Promise.all([
      graphGet("me", { fields: "id,name" }),
      graphGet("me/permissions")
    ]);
    res.json({ ok: true, me, permissions: permissions.data || [] });
  } catch (err) {
    sendError(res, err);
  }
});

// Create a new immutable AdCreative. Prefer object_story_id when reusing an approved post;
// otherwise pass a complete object_story_spec. New creatives are not activated by this endpoint.
app.post("/creative", async (req, res) => {
  try {
    const accountId = requireAllowedAccount(req.body.account_id);
    const { name, object_story_id, object_story_spec, url_tags } = req.body;
    if (!object_story_id && !object_story_spec) {
      return res.status(400).json({ ok: false, error: "Provide object_story_id or object_story_spec" });
    }

    const data = await graphPost(`${accountId}/adcreatives`, {
      name: name || `GPT replacement creative ${new Date().toISOString()}`,
      ...(object_story_id ? { object_story_id } : {}),
      ...(object_story_spec ? { object_story_spec } : {}),
      ...(url_tags ? { url_tags } : {})
    });
    res.json({ ok: true, creative_id: data.id });
  } catch (err) {
    sendError(res, err);
  }
});

// Create an ad PAUSED by default so Meta can review it before delivery.
app.post("/ad", async (req, res) => {
  try {
    const accountId = requireAllowedAccount(req.body.account_id);
    const { adset_id, creative_id, name, status } = req.body;
    if (!adset_id || !creative_id) {
      return res.status(400).json({ ok: false, error: "Missing adset_id or creative_id" });
    }

    const adsetAccount = await accountForObject(adset_id);
    if (adsetAccount !== accountId) {
      return res.status(400).json({ ok: false, error: "Ad set does not belong to account_id" });
    }

    const data = await graphPost(`${accountId}/ads`, {
      name: name || `GPT replacement ad ${new Date().toISOString()}`,
      adset_id: String(adset_id),
      creative: { creative_id: String(creative_id) },
      status: status === "ACTIVE" ? "ACTIVE" : "PAUSED"
    });
    res.json({ ok: true, ad_id: data.id });
  } catch (err) {
    sendError(res, err);
  }
});

// Swap the immutable creative reference on an existing ad. The ad remains in its current status.
app.post("/ad/:adId/creative", async (req, res) => {
  try {
    const { adId } = req.params;
    await requireAllowedObject(adId);
    const creativeId = req.body.creative_id;
    if (!creativeId || !/^\d+$/.test(String(creativeId))) {
      return res.status(400).json({ ok: false, error: "Invalid creative_id" });
    }

    const data = await graphPost(String(adId), {
      creative: { creative_id: String(creativeId) }
    });
    res.json({ ok: true, ad_id: adId, meta: data });
  } catch (err) {
    sendError(res, err);
  }
});

app.post("/ad/:adId/status", async (req, res) => {
  try {
    const { adId } = req.params;
    await requireAllowedObject(adId);
    const status = String(req.body.status || "").toUpperCase();
    if (!["ACTIVE", "PAUSED"].includes(status)) {
      return res.status(400).json({ ok: false, error: "status must be ACTIVE or PAUSED" });
    }

    const data = await graphPost(String(adId), { status });
    res.json({ ok: true, ad_id: adId, status, meta: data });
  } catch (err) {
    sendError(res, err);
  }
});

app.get("/", (req, res) => {
  res.send("Meta Ads API is running");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
