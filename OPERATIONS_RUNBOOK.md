# Conversion tracking operations runbook

This is the authoritative handover for Prep Taiwan and Prep Singapore conversion tracking. Read this file before reconnecting a platform or creating another credential.

## Non-negotiable event rules

- Form submission is `generate_lead`, never `purchase`.
- `purchase` is emitted only after Zoho reports the matching Sales Order as paid.
- The attribution key is the Google response Sheet **Order Number**, copied to Zoho `reference_number`.
- Never join on a Sheet row number or Zoho `salesorder_number`.
- One paid order produces one canonical GA4 purchase, one canonical Google Ads purchase import, and one Meta browser/server pair sharing the same `event_id`.
- Do not send health data, names, prescriptions, clinic details, or other patient information to advertising platforms.
- HYPD is not part of this architecture.

## Production locations and identities

| Area | Authoritative location or ID |
| --- | --- |
| Taiwan live mirror | `Z:\Preptaiwan` |
| Singapore live mirror | `Z:\clickandbuilds\PrestaShop\PrepSingapore` |
| SFTP host | `home717421847.1and1-data.host:22` |
| SFTP Taiwan root | `/preptaiwan` |
| SFTP Singapore root | `/clickandbuilds/PrestaShop/PrepSingapore` |
| Vercel team/production project | `venga-s-projects/meta-ads-backend` (`prj_VBomrgTjO8wa7WrPZRz6oXPpu578`) |
| Duplicate linked Vercel project | `venga-s-projects/vensure-meta-ads-bridge` (`prj_h5b77DeP6ziNVwxJpa8Qje2CPD5e`) — do not use for Zoho production |
| Paid-order endpoint | `https://meta-ads-backend-two.vercel.app/api/zoho/paid-order` |
| Zoho Books primary org | `747696142` |
| Zoho Books Singapore org | `806878109` |
| Zoho paid-order function | `paid_order_conversion_dispatch` (`2637982000045183001`) |
| Taiwan GTM | account `1910873823`, container `7723637`, public `GTM-PNPKVTQ`, workspace `84` |
| Singapore web GTM | account `2696141595`, container `8589435`, public `GTM-N96XM7K`, repair workspace `40` |
| Singapore server GTM | `GTM-KFNX7B92` |
| Google Ads customer | `1855670423` |
| Canonical Google purchase | `849227724` — `Preptaiwan - GA4 (web) purchase` |
| Taiwan GA4 / Meta | `G-L5NWYL0S9V` / pixel `209850509573148` |
| Singapore GA4 / Meta | `G-L3QF8L60CP` / pixel `244962973380244` |
| Make attribution scenario | `4920018` — `Paid Order Attribution Capture` (active) |
| Make paid lookup scenario | `4920650` — `Paid Order Attribution Lookup` (active) |
| Taiwan response spreadsheet | `1Fn0ExrJcNSSTEPcQUGPm0fX0UgsZ0rTI8oiGnek2_co` |
| Attribution tab | `Conversion Attribution` (`sheetId` `2109152026`) |

## Platform tool routing

Use the first option that is available. Move to a fallback only after recording the actual failure.

| Platform | Primary tool | Fallback | Rule |
| --- | --- | --- | --- |
| Live website files | Direct `Z:` paths | Vensure Ops SFTP, then SFTP client | The two sites are folders on the same host; no separate credential profile is required. Back up a live file before editing it. |
| Git/source | Local repository and Git | GitHub browser | Never commit `.env.local` or credential values. |
| Vercel | Connected Vercel tools for project/deployment reads and deploys | Logged-in Vercel browser for environment-variable changes; CLI only with a verified team-scoped token | Production project is `meta-ads-backend`, not the duplicate `vensure-meta-ads-bridge`. Do not create a new token merely because an old task selected the wrong project. |
| Zoho paid state/workflow | ZOHO MCP NEW / Zoho Workflow | Zoho Inventory for Sales Order retrieval | Books org `747696142` is primary. A purchase is valid only when paid status is confirmed. |
| GTM | GTM plugin | Logged-in GTM browser | Publish only after workspace review. Disable duplicate legacy purchase tags. |
| Google Ads | Composio Google Ads for reads/audits | Logged-in Google Ads browser for unsupported writes | Keep conversion action `849227724` as the only canonical Primary purchase. |
| GA4 | Logged-in Analytics browser | Measurement Protocol diagnostics | Use the correct property for each site. |
| Meta | Vercel `meta-ads-backend` direct CAPI | Events Manager/Ads Manager browser for verification | Server and browser Purchase must share the same event ID. |
| Stape | Existing browser gateway/CAPIG | Direct Meta CAPI in Vercel | Stape is not the Zoho paid-order transport unless an exact supported ingestion endpoint is supplied. |
| Make / Sheets | Connected Make and Google Sheets tools | Logged-in browser | Attribute by Sheet Order Number, never row number. |

## Credential and login policy

1. Machine-to-machine traffic must never depend on a human dashboard session.
2. Zoho sends both `x-zoho-paid-order-secret` and `x-vercel-protection-bypass`. The matching values live in Zoho and Vercel only.
3. Vercel secrets live in Production environment variables. Local copies belong only in ignored `.env.local`.
4. `VERCEL_TOKEN` must be a team-scoped token with access to `venga-s-projects/meta-ads-backend`. Validate it with `vercel whoami` before relying on it. The connected Vercel integration is the preferred persistent access path.
5. Browser login is only a fallback for dashboard-only actions. A browser session can expire; that is separate from webhook authentication and must not stop paid-order delivery.
6. Never print, paste into documentation, or commit secret values. Verify names and presence with `npm run check:config`.

For password-free Production synchronization, keep service secrets in ignored `.env.local`, store the Vercel token once using Windows DPAPI, and run:

```powershell
powershell -ExecutionPolicy Bypass -File tools/set-vercel-credential.ps1
powershell -ExecutionPolicy Bypass -File tools/sync-vercel-production.ps1 -Deploy
```

The first command is a one-time setup (and is repeated only when the token is revoked or rotated). The token is encrypted for the current Windows account under `%LOCALAPPDATA%\Vensure\meta-ads-backend`, outside the repository. The sync script verifies the token and every required value before changing anything, explicitly links the canonical `meta-ads-backend` project, updates variables without displaying values, and deploys only when requested. It refuses partial configuration.

### Fixed handover sequence for every future task

1. Read this runbook; do not rediscover platform paths or create replacement projects/connections.
2. Run `npm run check:config`. A missing service secret is a configuration issue; a Vercel `User not found` response means the saved token was revoked or belongs to the wrong account.
3. Use connected plugins first according to the routing table. Reuse healthy Make/Google/Zoho connections; do not request OAuth again when their status is `ok`.
4. For Vercel environment writes, run `tools/sync-vercel-production.ps1`; never depend on a browser login. If the encrypted token is absent/invalid, run `tools/set-vercel-credential.ps1` once with a team-scoped token for `venga-s-projects`.
5. Never ask for SFTP credentials when `Z:` is mounted and readable. Both sites use one SFTP account with different root folders.
6. Record every durable platform or identifier change in this file in the same commit as the code change.

If `Z:` is not mounted and the Vensure Ops connector reports `oauth_refresh_token_missing`, do not ask for the SFTP password again. The existing ignored local credential file is:

`C:\Users\wa_li\Documents\Codex\2026-09-13\computer-use-plugin-computer-use-openai\.env.local`

It contains the single shared `SFTP_HOST`, `SFTP_PORT`, `SFTP_USERNAME`, and `SFTP_PASSWORD` profile. Use `/preptaiwan` or `/clickandbuilds/PrestaShop/PrepSingapore` as the remote root. Reconnect the connector only when its managed write tools are specifically needed; its OAuth status does not invalidate the SFTP account.

## Required production configuration

The backend requires the variables listed in `.env.example`. In particular:

- `PAID_CONVERSION_DELIVERY_ENABLED=true`
- the Vercel and Zoho webhook secrets must match
- `GA4_API_SECRETS_BY_ORG` must contain both organization IDs
- direct Meta CAPI requires a usable token and both pixel mappings
- Vercel Deployment Protection automation bypass must remain installed in the Zoho function

Changing a Production environment variable requires a new production deployment.

## Release and verification checklist

1. Run `npm test` and `npm run check:config` locally.
2. Confirm the Zoho custom function still gates on paid status and idempotency fields.
3. Confirm the backend config endpoint reports delivery enabled and both organizations configured. Do not log secrets.
4. Deploy production and verify `/api/ping` through the automation-bypass header.
5. Use a controlled paid order or an existing newly paid live order; do not invent a patient order.
6. Verify exactly one GA4 purchase and one canonical Google Ads purchase.
7. Verify Meta browser/server events deduplicate with the same event ID.
8. Only after verification, begin the 2–4 week Google test using canonical purchase only.

## Rollback

- Fast safety stop: set `PAID_CONVERSION_DELIVERY_ENABLED=false` and redeploy.
- Zoho retries remain safe because `cf_paid_conversion_dispatched` is set only after complete delivery.
- Restore live website files from their dated `.codex-backup-*` copies if a site regression occurs.
- Do not re-enable the Singapore `stapetracking` legacy purchase hook; it duplicates the canonical path.

## Current known state

- Taiwan lead attribution capture is installed in `site/chn/orderform.php`.
- Taiwan's live order form now captures GCLID, GBRAID, WBRAID, Meta browser/click IDs and UTM fields, validates the Google Forms message origin/source, and pushes one `order_form_submitted` event before redirect. Published GTM version `81` maps that event to GA4 `generate_lead` with its deterministic dataLayer event ID; legacy purchase tags remain paused. Rollback copy: `orderform.php.codex-backup-20260915-lead-event`.
- Make scenario `4920018` stores attribution in the 16-column `Conversion Attribution` tab. Column A resolves the actual response Sheet `Order No` by matching column K `order_token` against `Form responses 1!AF:AF` and returning `Form responses 1!BW:BW`; this is the canonical join and is not a row number. Columns L:P preserve GBRAID, WBRAID, FBCLID, UTM term, and UTM content. The header protection and filter cover A:P.
- Singapore's unpaid/duplicate order-confirmation purchase hooks are disabled in both `stapega4` and `stapetracking`; backups: `stapega4.php.codex-backup-20260915` and `stapetracking.php.codex-backup-20260915`.
- Singapore's order confirmation now pushes non-PII `order_form_submitted`, and published GTM version `38` maps it once to GA4 `generate_lead`. Published version `39` pauses the final legacy Purchase dataLayer builder. The live container contains `order_form_submitted`/`generate_lead` and no active legacy Purchase builder.
- Vercel Deployment Protection has an automation bypass, and the Zoho function includes its header.
- Two Vercel projects are linked to the same GitHub repository. Zoho production uses `meta-ads-backend-two.vercel.app`, owned by project `meta-ads-backend`; the similarly named `vensure-meta-ads-bridge` deployment is not the paid-order target.
- Production delivery and GA4 Measurement Protocol readiness must be verified after the next environment update and redeployment.
- The paid-order backend contract accepts GA client/session IDs, GCLID/GBRAID/WBRAID, Meta IDs and UTM fields. GA4 `transaction_id` is the canonical response Sheet Order Number; the hashed `event_id` is reserved for cross-platform deduplication.
- Active Make scenario `4920650` receives the canonical response Order Number, searches column A of `Conversion Attribution`, and returns only advertising attribution fields. Its existing Google connection `284990` is healthy. The webhook URL is stored in the Zoho function and must not be copied into documentation or chat.
- The deployed Zoho function now calls scenario `4920650` with `reference_number` before dispatching a paid order. A matching row enriches the backend payload with GA/Meta/click/UTM fields; a missing row returns Make's plain `Accepted` response and is safely left unenriched and undispatched. No Sheet row number or Zoho `salesorder_number` is used.
- The lookup was verified with a temporary non-order probe covering all 16 attribution columns. The probe and 37 formula-only setup rows (all other cells empty) were removed immediately after verification; the production tab contains no synthetic test order.
