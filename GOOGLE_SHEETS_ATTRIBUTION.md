# Response Order Number attribution record

Use a dedicated `Attribution` tab in the existing Google Form response spreadsheet. The immutable key is `response_order_number`: the Order Number in that Sheet. It is copied to Zoho's Sales Order reference number and is distinct from Zoho's Sales Order Number. Never use a sheet row number, a timestamp, an email address, or health-form data as a key.

Suggested columns:

```text
response_order_number | captured_at | ga_client_id | fbp | fbc | gclid | utm_source | utm_medium | utm_campaign | referrer
```

An Apps Script should upsert this record by exact `response_order_number` when the Sheet's Order Number becomes available. On payment, the Zoho paid-order function uses that same response Order Number—not Zoho's Sales Order Number—to retrieve the record and sends only `ga_client_id`, `fbp`, and `fbc` with the signed paid-order webhook. The backend does not send the Order Number to Google or Meta.

Do not use a Google Sheet row position: rows change when form entries are inserted, removed, sorted, or repaired.
