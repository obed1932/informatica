/** Synthetic-only MariaDB/HTTP flow. Refuses any database except the isolated lab. */
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { PNG } from 'pngjs';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import { createApp } from './app.js';
import { pool, settings } from './config.js';
import { sha256 } from './domain.js';

const config = settings();
if (config.db.database !== 'otc_ingress_test' || config.db.host !== '127.0.0.1' || config.db.port !== 3307) {
  throw new Error('Esta prueba solo admite la MariaDB aislada 127.0.0.1:3307/otc_ingress_test');
}
const db = pool(config);
const requestId = randomUUID(), orderId = randomUUID(), userId = 1_000_000_000 + randomBytes(4).readUInt32BE() % 1_000_000_000;
const username = `test_${randomBytes(5).toString('hex')}`;
const password = randomBytes(24).toString('hex');
const oldToken = randomBytes(32).toString('base64url');
const snapshot = { solicitante: 'Persona Ficticia', servicio: 'Servicio de Prueba', equipo: { denominacion: 'PC DE PRUEBA', marca: 'DELL' },
  ocurrencia: 'Prueba sintética', diagnostico: 'Prueba sintética', trabajo_realizado: 'Prueba sintética', trabajos: [] };
let userCreated = false, requestCreated = false, server, browser;
const assertStatus = (response, code, stage) => { const status = typeof response.status === 'function' ? response.status() : response.status; if (status !== code) throw new Error(`${stage}: HTTP ${status}, esperado ${code}`); };
const post = (base, route, body, cookie = '') => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });

try {
  await db.execute('INSERT INTO otc_cloud_users (local_user_id,username,display_name,password_hash,role,active) VALUES (?,?,?,?,\'TECH\',1)',
    [userId, username, 'Técnico Ficticio', await bcrypt.hash(password, 10)]);
  userCreated = true;
  await db.execute(`INSERT INTO otc_public_requests
    (request_uuid,order_uuid,order_code,technician_local_id,document_version,document_sha256,token_sha256,snapshot_json,state,published_at,expires_at)
    VALUES (?,?,?, ?,1,?,?,?,'PENDING',UTC_TIMESTAMP(6),DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 24 HOUR))`,
    [requestId, orderId, 'OTC-TEST-LOCAL', userId, 'a'.repeat(64), sha256(oldToken), JSON.stringify(snapshot)]);
  requestCreated = true;
  server = createApp({ db, config }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  config.origin = base;

  assertStatus(await post(base, '/api/support/login', { username, password: 'incorrecta' }), 401, 'login incorrecto');
  browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const support = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  support.on('pageerror', error => pageErrors.push(error.message));
  support.on('dialog', dialog => dialog.accept());
  await support.goto(base + '/', { waitUntil: 'networkidle' });
  await support.getByLabel('Usuario').fill(username);
  await support.getByLabel('Contraseña').fill(password);
  await support.getByRole('button', { name: 'Entrar al panel' }).click();
  await support.locator('.support-user').waitFor();
  await support.locator('.support-item').filter({ hasText: 'OTC-TEST-LOCAL' }).click();
  const responsePromise = support.waitForResponse(response => response.url().endsWith(`/api/support/orders/${requestId}/qr`) && response.request().method() === 'POST');
  await support.getByRole('button', { name: 'Generar o renovar QR' }).click();
  const qrResponse = await responsePromise;
  assertStatus(qrResponse, 200, 'renovación QR desde React');
  const qr = await qrResponse.json();
  await support.locator('.support-qr svg').waitFor();
  const token = new URLSearchParams(new URL(qr.url).hash.slice(1)).get('token');
  assertStatus(await post(base, '/api/request', { request_uuid: requestId, token: oldToken }), 404, 'QR anterior invalidado');
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  mobile.on('pageerror', error => pageErrors.push(error.message));
  mobile.on('dialog', dialog => dialog.accept());
  await mobile.goto(qr.url, { waitUntil: 'networkidle' });
  await mobile.locator('.signer strong').waitFor();
  if (await mobile.locator('.signer strong').textContent() !== snapshot.solicitante) throw new Error('Solicitante visible incorrecto');
  await mobile.locator('#signature').evaluate(canvas => {
    const box = canvas.getBoundingClientRect();
    for (const [type, x, y] of [['pointerdown', 30, 80], ['pointermove', 100, 50], ['pointermove', 170, 90], ['pointerup', 170, 90]]) {
      canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: box.left + x, clientY: box.top + y }));
    }
  });
  await mobile.locator('.final-consent input').check();
  const button = mobile.getByRole('button', { name: /Confirmar y enviar visado/ });
  if (!(await button.isEnabled())) throw new Error(`Botón de visado deshabilitado: signed=${await mobile.locator('.canvas-wrap').getAttribute('class')}, checked=${await mobile.locator('.final-consent input').isChecked()}`);
  const confirmedPromise = mobile.waitForResponse(response => response.url().endsWith('/api/conform') && response.request().method() === 'POST');
  await button.click();
  const confirmed = await confirmedPromise;
  assertStatus(confirmed, 200, 'visado desde móvil');
  const result = await confirmed.json();
  await mobile.getByText('Tu conformidad quedó registrada', { exact: false }).waitFor();
  await mkdir('test-output', { recursive: true });
  await mobile.screenshot({ path: 'test-output/otc-visado-mobile.png', fullPage: true });
  const png = new PNG({ width: 220, height: 100 }); png.data.fill(255);
  const conformity = { request_uuid: requestId, token, accepted: true, signer_is_third_party: false,
    signature_png_base64: PNG.sync.write(png).toString('base64') };
  assertStatus(await post(base, '/api/conform', conformity), 409, 'segundo visado bloqueado');
  const [decisions] = await db.execute('SELECT signer_name,signature_sha256 FROM otc_public_decisions WHERE request_uuid=?', [requestId]);
  const [outbox] = await db.execute('SELECT state,event_uuid FROM otc_public_outbox WHERE request_uuid=?', [requestId]);
  const [audit] = await db.execute('SELECT action FROM otc_qr_audit WHERE request_uuid=?', [requestId]);
  if (decisions.length !== 1 || outbox.length !== 1 || audit.length !== 1 || outbox[0].event_uuid !== result.event_uuid) throw new Error('Falta decisión, outbox o auditoría');
  if (pageErrors.length) throw new Error(`Errores JavaScript: ${pageErrors.join('; ')}`);
  console.log('OK: login React, bandeja, QR, token anterior revocado, firma móvil, visado único, decisión/outbox/auditoría en MariaDB');
} finally {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (requestCreated) {
    await db.execute('DELETE FROM otc_public_outbox WHERE request_uuid=?', [requestId]);
    await db.execute('DELETE FROM otc_public_decisions WHERE request_uuid=?', [requestId]);
    await db.execute('DELETE FROM otc_qr_audit WHERE request_uuid=?', [requestId]);
    await db.execute('DELETE FROM otc_public_requests WHERE request_uuid=?', [requestId]);
  }
  if (userCreated) {
    await db.execute('DELETE FROM otc_cloud_sessions WHERE local_user_id=?', [userId]);
    await db.execute('DELETE FROM otc_cloud_users WHERE local_user_id=?', [userId]);
  }
  await db.end();
}
