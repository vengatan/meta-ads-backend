# Zoho paid-order conversion contract

`POST /api/zoho/paid-order` accepts a paid Sales Order confirmation from Zoho Books.

## Required Vercel environment variables

```text
ZOHO_ORGANIZATION_ID=747696142
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
  "reference_number": "<Zoho Sales Order reference>",
  "paid_status": "paid",
  "amount": 378.4,
  "currency": "SGD",
  "paid_at": "2026-09-13T10:30:00+08:00",
  "ga_client_id": "optional GA4 client ID",
  "fbp": "optional Meta browser ID",
  "fbc": "optional Meta click ID"
}
```

The endpoint rejects any status other than `paid`. Its event ID is derived from the organization and Zoho Sales Order ID, so it never exposes the Sales Order reference to an ad platform.

## Attribution prerequisites

Zoho Sales Orders currently contain no web attribution fields. Before enabling delivery, add non-health custom fields for GA4 client ID, Meta browser ID (`fbp`), and Meta click ID (`fbc`), then capture them with user consent at lead creation. Do not transmit names, emails, prescriptions, clinic details, or other health-related information.

## Enable delivery

After a successful signed webhook test and explicit authorization for conversion transmission, configure:

```text
PAID_CONVERSION_DELIVERY_ENABLED=true
GA4_MEASUREMENT_ID=<GA4 measurement ID>
GA4_API_SECRET=<GA4 Measurement Protocol secret>
META_PIXEL_ID=<Meta dataset/pixel ID>
META_ACCESS_TOKEN=<Meta Conversions API token>
PAID_ORDER_EVENT_SOURCE_URL=https://preptaiwan.org/
```

GA4 receives the canonical `purchase` event. Google Ads should import that one verified GA4 purchase action as Primary; all duplicate purchase actions remain Secondary.
