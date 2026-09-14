# Zoho paid-order conversion contract

`POST /api/zoho/paid-order` accepts a paid Sales Order confirmation from Zoho Books.

## Required Vercel environment variables

```text
# Comma-separated Zoho Books organization IDs.
ZOHO_ORGANIZATION_IDS=747696142,806878109
ZOHO_PAID_ORDER_WEBHOOK_SECRET=<a-long-random-secret>
PAID_CONVERSION_DELIVERY_ENABLED=false
```

Keep delivery disabled until the attribution fields below are populated and the owner authorises data transmission to Google and Meta.

## Zoho webhook request

Send a JSON `POST` with:

```text
x-zoho-paid-order-secret: <the-secret>
```

```json
{
  "organization_id": "747696142",
  "salesorder_id": "<Zoho Sales Order ID>",
  "response_order_number": "<Order Number from the Google response Sheet>",
  "paid_status": "paid",
  "amount": 378.4,
  "currency": "SGD",
  "paid_at": "2026-09-13T10:30:00+08:00",
  "ga_client_id": "optional GA4 client ID",
  "fbp": "optional Meta browser ID",
  "fbc": "optional Meta click ID"
}
```

The endpoint rejects any status other than `paid` and accepts only the Zoho Books organizations listed in `ZOHO_ORGANIZATION_IDS`. `response_order_number` is the only attribution join key: it is the **Order Number in the Google response Sheet**, copied into Zoho's Sales Order **reference number**. It is not Zoho's `salesorder_number`. A Sheet row number must never be stored or used. Its event ID is derived from the organization and Zoho Sales Order ID, so it never exposes the response Order Number to an ad platform. During the short migration window, `reference_number` and `order_number` are accepted as backward-compatible aliases.

## Zoho idempotency fields

The following non-PII Sales Order fields are configured in Zoho Books:

- `cf_paid_conversion_dispatched` — checkbox; set to `true` only after the webhook returns success.
- `cf_paid_conversion_event_id` — unique text field; store the endpoint's returned `event_id`.

Zoho Books Sales Order workflows do not expose `paid_status` as a rule criterion. The active `Paid Sales Order conversion dispatch` workflow therefore calls the `paid_order_conversion_dispatch` custom function on Sales Order changes. That function reads the current Sales Order, exits unless `paid_status` is `paid`, and only writes these fields after the endpoint reports a non-disabled delivery. This avoids both unpaid-order conversions and duplicate paid-order dispatches.

## Attribution prerequisites

Store attribution in a dedicated response-Sheet tab keyed by `response_order_number`, with one record per Google response Order Number. Before enabling delivery, populate that record with consented non-health values: GA4 client ID, Meta browser ID (`fbp`), Meta click ID (`fbc`), Google click ID (`gclid`), UTM values, and referrer. The paid-order function must look up attribution by `response_order_number`, never by a Sheet row number or Zoho Sales Order Number, then pass only GA4/Meta identifiers to this endpoint. Do not transmit names, emails, prescriptions, clinic details, or other health-related information.

## Enable delivery

After a successful signed webhook test and explicit authorization for conversion transmission, configure:

```text
PAID_CONVERSION_DELIVERY_ENABLED=true
META_CAPI_TRANSPORT=direct
GA4_MEASUREMENT_ID=<GA4 measurement ID for a one-site deployment>
GA4_API_SECRET=<GA4 Measurement Protocol secret for a one-site deployment>
# For Taiwan + Singapore, use organization-specific JSON maps instead:
GA4_MEASUREMENT_IDS_BY_ORG={"747696142":"G-L5NWYL0S9V","806878109":"G-L3QF8L60CP"}
GA4_API_SECRETS_BY_ORG={"747696142":"<Taiwan secret>","806878109":"<Singapore secret>"}
META_PIXEL_IDS_BY_ORG={"747696142":"209850509573148","806878109":"244962973380244"}
META_ACCESS_TOKEN=<Meta Conversions API token>
STAPE_META_CAPI_GATEWAY_URLS_BY_ORG={"747696142":"<exact Taiwan CAPI ingestion URL>","806878109":"<exact Singapore CAPI ingestion URL>"}
STAPE_META_CAPI_GATEWAY_TOKEN=<optional Stape gateway bearer token>
PAID_ORDER_EVENT_SOURCE_URLS_BY_ORG={"747696142":"https://preptaiwan.org/","806878109":"https://prepsingapore.com/"}
```

`META_CAPI_TRANSPORT=direct` sends paid purchases to Meta's official Conversions API using `META_ACCESS_TOKEN` (or `META_ACCESS_TOKENS_BY_ORG` when the pixels require separate tokens). This is the supported free fallback for Zoho Books because Stape CAPIG exposes browser-event mirroring and CRM-specific integrations, but does not document a generic live-event endpoint. Keep the existing Stape CAPIG enabled for browser coverage.

Set `META_CAPI_TRANSPORT=stape` only when Stape supplies an exact organization-specific ingestion URL. In that mode, the backend uses `STAPE_META_CAPI_GATEWAY_URLS_BY_ORG` and refuses a Meta Graph URL. Organization-specific Pixel IDs and source URLs prevent Taiwan and Singapore paid orders from being attributed to the wrong dataset. Singular variables remain available only as backward-compatible fallbacks for a one-organization deployment.

GA4 receives the canonical `purchase` event. Google Ads should import that one verified GA4 purchase action as Primary; all duplicate purchase actions remain Secondary.
