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
    reference_number: "6517",
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

test("rejects an unpaid sales order", async () => {
  const response = await post(paidOrder({ paid_status: "unpaid" }));
  const data = await response.json();

  assert.equal(response.status, 409);
  assert.equal(data.error, "Sales Order is not paid");
});

test("rejects an invalid webhook secret", async () => {
  const response = await post(paidOrder(), "wrong-secret");
  const data = await response.json();

  assert.equal(response.status, 401);
  assert.equal(data.error, "Unauthorized");
});

test.after(() => server.close());
