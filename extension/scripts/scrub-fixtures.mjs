// Removes personal data from recorded YouTube responses before they go into git:
// IP addresses, visitor ids, and the per-request video server URLs that reveal your location/ISP.
// Usage: node scripts/scrub-fixtures.mjs [files…]   (default: test/fixtures/*.json)

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DROP = new Set(['watchEndpointSupportedOnesieConfig', 'serviceTrackingParams', 'mainAppWebResponseContext']);
const REDACT = new Set(['visitorData', 'rolloutToken', 'datasyncId', 'remoteHost']);
const IPV4 = /\b(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g;

function scrub(node) {
  if (Array.isArray(node)) return node.map(scrub);
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (DROP.has(k)) continue;
      out[k] = REDACT.has(k) ? 'REDACTED' : scrub(v);
    }
    return out;
  }
  return typeof node === 'string' ? node.replace(IPV4, '192.0.2.1') : node;
}

const dir = 'test/fixtures';
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f));
for (const file of files) {
  const before = readFileSync(file, 'utf8');
  const after = JSON.stringify(scrub(JSON.parse(before)));
  writeFileSync(file, after);
  console.log(`${file}: ${before.length} → ${after.length} bytes`);
}
