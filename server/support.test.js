import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { createApp } from './app.js';

const requestId = '11111111-2222-4333-8444-555555555555';

test('login real, propietario de OTC, QR único y cierre', async () => {
  const hash = await bcrypt.hash('clave-sintetica', 4);
  let row = { request_uuid: requestId, technician_local_id: 7, state: 'PENDING', order_code: 'OTC-TEST' };
  const executed = [];
  const connection = {
    async beginTransaction() { executed.push('BEGIN'); }, async commit() { executed.push('COMMIT'); },
    async rollback() { executed.push('ROLLBACK'); }, release() {},
    async execute(sql, params) {
      executed.push(sql);
      if (sql.includes('FROM otc_public_requests WHERE request_uuid=')) return [[{ ...row }]];
      if (sql.startsWith('UPDATE otc_public_requests SET token_sha256=')) row = { ...row, token_sha256: params[0] };
      return [{}];
    },
  };
  const db = {
    getConnection: async () => connection,
    async execute(sql, params) {
      executed.push(sql);
      if (sql.includes('FROM otc_cloud_users WHERE username=')) return [[{ local_user_id: 7, username: 'TECNICO', display_name: 'Técnico Prueba', password_hash: hash, role: 'TECH' }]];
      if (sql.includes('FROM otc_cloud_sessions s')) return [[{ local_user_id: 7, username: 'TECNICO', display_name: 'Técnico Prueba', role: 'TECH' }]];
      if (sql.includes('FROM otc_public_requests WHERE technician_local_id=')) return [[{ ...row, document_version: 1, expires_at: '2099-01-01 00:00:00', published_at: '2026-09-29 00:00:00', snapshot_json: '{}' }]];
      return [{}];
    },
  };
  const app = createApp({ db, config: { origin: 'http://127.0.0.1', relayKey: 'x'.repeat(40) } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${base}/api/support/orders/${requestId}/qr`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 401);
    response = await fetch(`${base}/api/support/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'TECNICO', password: 'clave-sintetica' }) });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    response = await fetch(`${base}/api/support/orders`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).items.length, 1);
    response = await fetch(`${base}/api/support/orders/${requestId}/qr`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 200);
    const qr = await response.json();
    assert.match(qr.url, /#token=/);
    assert.equal(qr.url.includes('clave-sintetica'), false);
    assert.equal(executed.some(sql => sql.startsWith('INSERT INTO otc_qr_audit')), true);
    assert.equal(executed.includes('COMMIT'), true);
    row.state = 'CONFORME';
    response = await fetch(`${base}/api/support/orders/${requestId}/qr`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 409);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
