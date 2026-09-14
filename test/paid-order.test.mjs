import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

process.env.ZOHO_ORGANIZATION_ID = "747696142";
process.env.ZOHO_PAID_ORDER_WEBHOOK_SECRET = "test-secret";
delete process.env.PAID_CONVERSION_DELIVERY_ENABLED;

const { default: app } = await import("../server.js");
const server = app.listen(0);
await once(server, "listening");
const baseUrl = `http://127.0.0.1:${server.address().port}`;

function paidOrder(overrides = {}) {
  return {
    organization_id: "747696142",
    salesorder_id: "2637982000045158007",
    response_order_number: "6517",
    paid_status: "paid",
    amount: 374,
    currency: "SGD",
    paid_at: "2026-09-12T17:34:05+08:00",
    ...overrides
  };
}

async function post(payload, secret = "test-secret") {
  return fetch(`${baseUrl}/api/zoho/paid-order`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-zoho-paid-order-secret": secret
    },
    body: JSON.stringify(payload)
  });
}

test("accepts a signed paid order without enabling delivery", async () => {
  const response = await post(paidOrder());
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.delivery.mode, "disabled");
  assert.match(data.event_id, /^[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(data.event_id, /6517/);
});

test("accepts a paid order from the second Zoho Books organization", async () => {
  const prior = process.env.ZOHO_ORGANIZATION_IDS;
  process.env.ZOHO_ORGANIZATION_IDS = "747696142,806878109";
  try {
    const response = await post(paidOrder({ organization_id: "806878109" }));
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.delivery.mode, "disabled");
  } finally {
    if (prior === undefined) delete process.env.ZOHO_ORGANIZATION_IDS;
    else process.env.ZOHO_ORGANIZATION_IDS = prior;
  }
});

test("rejects an unpaid sales order", async () => {
  const response = await post(paidOrder({ paid_status: "unpaid" }));
  const data = await response.json();

  assert.equal(response.status, 409);
  assert.equal(data.error, "Sales Order is not paid");
});

test("requires the response Order Number attribution key", async () => {
  const response = await post(paidOrder({ response_order_number: "" }));
  const data = await response.json();

  assert.equal(response.status, 400);
  assert.equal(data.error, "organization_id, salesorder_id, and response_order_number are required");
});

test("refuses a direct Meta Graph endpoint when paid delivery is enabled", async () => {
  const prior = {
    enabled: process.env.PAID_CONVERSION_DELIVERY_ENABLED,
    pixel: process.env.META_PIXEL_ID,
    gateway: process.env.STAPE_META_CAPI_GATEWAY_URL
  };
  process.env.PAID_CONVERSION_DELIVERY_ENABLED = "true";
  process.env.META_PIXEL_ID = "209850509573148";
  process.env.STAPE_META_CAPI_GATEWAY_URL = "https://graph.facebook.com/v25.0/209850509573148/events";
  try {
    const response = await post(paidOrder({ fbp: "fb.1.1700000000.123456789" }));
    const data = await response.json();

    assert.equal(response.status, 503);
    assert.equal(data.error, "STAPE_META_CAPI_GATEWAY_URL must point to the Stape gateway, not Meta Graph");
  } finally {
    if (prior.enabled === undefined) delete process.env.PAID_CONVERSION_DELIVERY_ENABLED;
    else process.env.PAID_CONVERSION_DELIVERY_ENABLED = prior.enabled;
    if (prior.pixel === undefined) delete process.env.META_PIXEL_ID;
    else process.env.META_PIXEL_ID = prior.pixel;
    if (prior.gateway === undefined) delete process.env.STAPE_META_CAPI_GATEWAY_URL;
    else process.env.STAPE_META_CAPI_GATEWAY_URL = prior.gateway;
  }
});

test("does not fall back to another organization's Meta pixel when a map is configured", async () => {
  const prior = {
    enabled: process.env.PAID_CONVERSION_DELIVERY_ENABLED,
    pixels: process.env.META_PIXEL_IDS_BY_ORG,
    pixel: process.env.META_PIXEL_ID,
    gateways: process.env.STAPE_META_CAPI_GATEWAY_URLS_BY_ORG
  };
  process.env.PAID_CONVERSION_DELIVERY_ENABLED = "true";
  process.env.META_PIXEL_ID = "wrong-global-pixel";
  process.env.META_PIXEL_IDS_BY_ORG = JSON.stringify({ "806878109": "244962973380244" });
  process.env.STAPE_META_CAPI_GATEWAY_URLS_BY_ORG = JSON.stringify({ "747696142": "https://gateway.example/events" });
  try {
    const response = await post(paidOrder({ fbp: "fb.1.1700000000.123456789" }));
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.delivery.mode, "enabled");
    assert.match(data.delivery.results.meta, /^skipped:/);
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      const envName = { enabled: "PAID_CONVERSION_DELIVERY_ENABLED", pixels: "META_PIXEL_IDS_BY_ORG", pixel: "META_PIXEL_ID", gateways: "STAPE_META_CAPI_GATEWAY_URLS_BY_ORG" }[key];
      if (value === undefined) delete process.env[envName];
      else process.env[envName] = value;
    }
  }
});

test("rejects malformed organization-specific Meta configuration", async () => {
  const prior = {
    enabled: process.env.PAID_CONVERSION_DELIVERY_ENABLED,
    pixels: process.env.META_PIXEL_IDS_BY_ORG
  };
  process.env.PAID_CONVERSION_DELIVERY_ENABLED = "true";
  process.env.META_PIXEL_IDS_BY_ORG = "not-json";
  try {
    const response = await post(paidOrder({ fbp: "fb.1.1700000000.123456789" }));
    const data = await response.json();

    assert.equal(response.status, 503);
    assert.equal(data.error, "META_PIXEL_IDS_BY_ORG must be a JSON object");
  } finally {
    if (prior.enabled === undefined) delete process.env.PAID_CONVERSION_DELIVERY_ENABLED;
    else process.env.PAID_CONVERSION_DELIVERY_ENABLED = prior.enabled;
    if (prior.pixels === undefined) delete process.env.META_PIXEL_IDS_BY_ORG;
    else process.env.META_PIXEL_IDS_BY_ORG = prior.pixels;
  }
});

test("rejects an invalid webhook secret", async () => {
  const response = await post(paidOrder(), "wrong-secret");
  const data = await response.json();

  assert.equal(response.status, 401);
  assert.equal(data.error, "Unauthorized");
});

test.after(() => server.close());
