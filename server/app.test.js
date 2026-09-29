import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PNG } from 'pngjs';
import { createApp } from './app.js';
import { sha256 } from './domain.js';

const requestId = '11111111-2222-4333-8444-555555555555';
const orderId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

test('lectura y visado transaccional único con evento pendiente', async () => {
  const token = randomBytes(32).toString('hex');
  const row = { request_uuid: requestId, order_uuid: orderId, order_code: 'OTC-DEMO', document_version: 1,
    document_sha256: 'a'.repeat(64), token_sha256: sha256(token), snapshot_json: JSON.stringify({ solicitante: 'Persona Prueba', servicio: 'Archivo Clínico' }),
    state: 'PENDING', expires_at: '2099-01-01 00:00:00', viewed_at: null };
  const statements = [];
  const connection = {
    async beginTransaction() { statements.push('BEGIN'); },
    async commit() { statements.push('COMMIT'); },
    async rollback() { statements.push('ROLLBACK'); },
    release() {},
    async execute(sql, args) {
      statements.push(sql);
      if (sql.startsWith('SELECT')) return [[{ ...row }]];
      if (sql.startsWith('UPDATE otc_public_requests SET state=')) row.state = 'CONFORME';
      if (sql.startsWith('INSERT INTO otc_public_outbox')) assert.equal(JSON.parse(args[2]).evidence.solicitante_original, 'Persona Prueba');
      return [{}];
    },
  };
  const db = { execute: (...args) => connection.execute(...args), getConnection: async () => connection };
  const app = createApp({ db, config: { origin: 'http://127.0.0.1', relayKey: 'x'.repeat(40) } });
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    async function post(route, body) {
      const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    }
    const read = await post('/api/request', { request_uuid: requestId, token });
    assert.equal(read.status, 200);
    assert.equal(read.body.requester, 'Persona Prueba');
    assert.equal((await post('/api/request', { request_uuid: requestId, token: randomBytes(32).toString('hex') })).status, 404);
    const png = new PNG({ width: 200, height: 100 }); png.data.fill(255);
    const body = { request_uuid: requestId, token, accepted: true, signer_is_third_party: false,
      signature_png_base64: PNG.sync.write(png).toString('base64') };
    const accepted = await post('/api/conform', body);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.delivery, 'PENDING');
    assert.equal(statements.includes('COMMIT'), true);
    assert.equal((await post('/api/conform', body)).status, 409);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
