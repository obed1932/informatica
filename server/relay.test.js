import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { relayOnce } from './relay.js';

test('relay firma el evento y marca SENT solo tras acuse 202', async () => {
  const payload = JSON.stringify({ event_uuid: 'lab', event_type: 'OTC_CONFORMIDAD' });
  const calls = [];
  const db = { query: async () => [[{ event_uuid: 'lab', payload_json: payload }]],
    execute: async (sql, args) => { calls.push({ sql, args }); } };
  const oldFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(String(url), 'https://example.invalid/otc/events');
    const stamp = options.headers['X-OTC-Timestamp'];
    assert.equal(options.headers['X-OTC-Signature'],
      createHmac('sha256', 'a'.repeat(32)).update(`${stamp}.${payload}`).digest('hex'));
    assert.equal(options.body, payload);
    return { status: 202 };
  };
  try { assert.equal(await relayOnce(db, { relayUrl: 'https://example.invalid/otc/events', relayKey: 'a'.repeat(32) }), 1); }
  finally { global.fetch = oldFetch; }
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /state='SENT'/);
});
