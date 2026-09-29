import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { pool, settings } from './config.js';

export function validateRelayUrl(config) {
  const url = new URL(config.relayUrl);
  if (url.protocol !== 'https:' || url.pathname !== '/otc/events' || url.search || url.hash) throw new Error('OTC_RELAY_URL inválida');
  return url;
}

export async function relayOnce(db, config) {
  const url = validateRelayUrl(config);
  const [rows] = await db.query("SELECT event_uuid,payload_json FROM otc_public_outbox WHERE state='PENDING' ORDER BY created_at,event_uuid LIMIT 30");
  for (const row of rows) {
    const raw = typeof row.payload_json === 'string' ? row.payload_json : JSON.stringify(row.payload_json);
    const stamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', config.relayKey).update(`${stamp}.${raw}`).digest('hex');
    let result;
    try {
      result = await fetch(url, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(12000),
        headers: { 'Content-Type': 'application/json', 'X-OTC-Timestamp': stamp, 'X-OTC-Signature': signature }, body: raw });
    } catch (error) { result = { status: 0, error: error.name }; }
    if (result.status === 202) {
      await db.execute("UPDATE otc_public_outbox SET state='SENT',attempts=attempts+1,last_error=NULL,sent_at=UTC_TIMESTAMP(6) WHERE event_uuid=? AND state='PENDING'", [row.event_uuid]);
      console.log(`Sent ${row.event_uuid}`);
    } else {
      await db.execute("UPDATE otc_public_outbox SET attempts=attempts+1,last_error=? WHERE event_uuid=? AND state='PENDING'",
        [String(result.error || `HTTP ${result.status}`).slice(0, 250), row.event_uuid]);
      console.error(`Retry pending ${row.event_uuid}`);
    }
  }
  return rows.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = settings();
  if (!config.relayEnabled) { console.error('Relay desactivado'); process.exit(2); }
  const db = pool(config);
  try { await relayOnce(db, config); } finally { await db.end(); }
}
