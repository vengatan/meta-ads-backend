import fs from 'node:fs';
import path from 'node:path';

const envPath = process.argv[2] || '.env.local';
const absolutePath = path.resolve(envPath);

if (!fs.existsSync(absolutePath)) {
  console.error(`Configuration file not found: ${absolutePath}`);
  process.exit(1);
}

const values = {};
for (const rawLine of fs.readFileSync(absolutePath, 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const equals = line.indexOf('=');
  if (equals < 1) continue;
  values[line.slice(0, equals).trim()] = line.slice(equals + 1).trim();
}

const checks = [
  ['VERCEL_TOKEN', true],
  ['ZOHO_ORGANIZATION_IDS', true],
  ['ZOHO_PAID_ORDER_WEBHOOK_SECRET', true],
  ['PAID_CONVERSION_DELIVERY_ENABLED', true],
  ['GA4_MEASUREMENT_IDS_BY_ORG', true],
  ['GA4_API_SECRETS_BY_ORG', true],
  ['META_CAPI_TRANSPORT', true],
  ['META_PIXEL_IDS_BY_ORG', true],
  ['META_ACCESS_TOKEN', true],
  ['PAID_ORDER_EVENT_SOURCE_URLS_BY_ORG', true],
  ['VERCEL_AUTOMATION_BYPASS_SECRET', false],
];

let failed = false;
for (const [key, required] of checks) {
  const present = Boolean(values[key]);
  console.log(`${present ? 'OK     ' : required ? 'MISSING' : 'OPTION '} ${key}`);
  if (required && !present) failed = true;
}

const jsonKeys = [
  'GA4_MEASUREMENT_IDS_BY_ORG',
  'GA4_API_SECRETS_BY_ORG',
  'META_PIXEL_IDS_BY_ORG',
  'PAID_ORDER_EVENT_SOURCE_URLS_BY_ORG',
];

for (const key of jsonKeys) {
  if (!values[key]) continue;
  try {
    const parsed = JSON.parse(values[key]);
    for (const orgId of ['747696142', '806878109']) {
      if (!parsed[orgId]) {
        console.log(`MISSING ${key}[${orgId}]`);
        failed = true;
      }
    }
  } catch {
    console.log(`INVALID ${key} (must be JSON)`);
    failed = true;
  }
}

console.log(`VALUE   PAID_CONVERSION_DELIVERY_ENABLED=${values.PAID_CONVERSION_DELIVERY_ENABLED || '<unset>'}`);
process.exitCode = failed ? 1 : 0;
