import test from 'node:test';
import assert from 'node:assert/strict';
import { settings } from './config.js';

const base = {
  OTC_DB_HOST: 'localhost', OTC_DB_NAME: 'test', OTC_DB_USER: 'test',
  OTC_DB_PASSWORD: 'test-secret', OTC_SITE_ORIGIN: 'https://otc.example.org',
  OTC_RELAY_HMAC_KEY: 'a'.repeat(32),
};

test('a configured HTTPS relay URL activates delivery even with a stale disabled flag', () => {
  const config = settings({ ...base, OTC_RELAY_URL: 'https://relay.example.org/otc/events', OTC_RELAY_ENABLED: 'false' });
  assert.equal(config.relayEnabled, true);
});

test('delivery stays disabled when no relay URL is configured', () => {
  assert.equal(settings(base).relayEnabled, false);
});
