# Prep conversion operations

Before changing, deploying, or diagnosing this repository, read `OPERATIONS_RUNBOOK.md` in full. It is the authoritative cross-platform handover.

Mandatory operating rules:

- Follow the runbook's platform tool routing and canonical IDs. Do not create a replacement project, credential profile, OAuth connection, webhook, tag, pixel, or conversion action merely because a preferred tool is unavailable.
- Reuse connected plugins and healthy saved connections before browser sessions. Browser authentication is a dashboard-only fallback, never a machine-to-machine dependency.
- Do not use Windows Computer Use or manipulate the user's visible browser for this project. BrowserOS/CDP may be used only through its MCP on port `9001`, in a newly created background tab or isolated session that does not navigate, focus, refresh, or close any user tab. If background isolation cannot be proven, do not use browser automation.
- Use `Z:\Preptaiwan` and `Z:\clickandbuilds\PrestaShop\PrepSingapore` directly when mounted. They are different folders on the same live host and do not require separate SFTP credentials.
- If `Z:` is unavailable and Vensure Ops reports `oauth_refresh_token_missing`, use the existing ignored SFTP credential file documented in `OPERATIONS_RUNBOOK.md`; do not ask the user to recreate the same SFTP account.
- For Vercel Production environment writes, use `tools/sync-vercel-production.ps1`. It reuses the current Windows user's encrypted DPAPI credential. Run `tools/set-vercel-credential.ps1` only when the credential is absent, revoked, or deliberately rotated.
- Never print or commit secret values or customer/patient data.
- Form submissions are `generate_lead`; only Zoho-confirmed paid orders are `purchase`.
- The canonical attribution/transaction key is the Google response Sheet `Order No`, copied to Zoho `reference_number`. It is never a Sheet row number, Zoho `salesorder_number`, or the hashed event ID.
- Update `OPERATIONS_RUNBOOK.md` in the same commit whenever a durable platform path, identifier, connection, or fallback changes.
