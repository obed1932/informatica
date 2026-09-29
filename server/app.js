import express from 'express';
import { randomUUID, createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { HttpError, isUuid, publicPayload, publicState, sha256, signatureBytes, tokenMatches, validSigner } from './domain.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const legacyAssets = path.join(root, 'public', 'assets');
const dist = path.join(root, 'build');
const fail = (status, message) => { throw new HttpError(status, message); };

export function createApp({ db, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store, max-age=0', 'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" });
    next();
  });
  app.use('/api', (req, _res, next) => {
    if (req.headers.origin && req.headers.origin !== config.origin) return next(new HttpError(403, 'Origen no permitido'));
    if (req.method !== 'POST') return next(new HttpError(405, 'Método no permitido'));
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return next(new HttpError(415, 'Se requiere JSON'));
    next();
  });
  app.use('/api', express.json({ limit: '400kb', strict: true }));

  async function checkedRequest(connection, id, token, lock = false) {
    if (!isUuid(id) || typeof token !== 'string' || token.length < 32 || token.length > 128) fail(404, 'Solicitud no disponible');
    const [rows] = await connection.execute(`SELECT * FROM otc_public_requests WHERE request_uuid=?${lock ? ' FOR UPDATE' : ''}`, [id]);
    if (!tokenMatches(rows[0], id, token)) fail(404, 'Solicitud no disponible');
    return rows[0];
  }

  app.post('/api/request', async (req, res, next) => {
    try {
      const { request_uuid: id, token } = req.body || {};
      const row = await checkedRequest(db, id, token);
      if (row.state === 'PENDING' && row.viewed_at === null) await db.execute('UPDATE otc_public_requests SET viewed_at=UTC_TIMESTAMP(6) WHERE request_uuid=? AND viewed_at IS NULL', [id]);
      res.json(publicPayload(row));
    } catch (error) { next(error); }
  });

  app.post('/api/conform', async (req, res, next) => {
    let connection;
    try {
      const input = req.body || {};
      if (input.accepted !== true) fail(422, 'Debe aceptar expresamente');
      const png = signatureBytes(input.signature_png_base64);
      connection = await db.getConnection();
      await connection.beginTransaction();
      const row = await checkedRequest(connection, input.request_uuid, input.token, true);
      if (publicState(row) !== 'PENDING') fail(409, 'Esta solicitud ya no admite visado');
      const snapshot = typeof row.snapshot_json === 'string' ? JSON.parse(row.snapshot_json) : row.snapshot_json;
      const { name, thirdParty } = validSigner(input, snapshot.solicitante);
      const eventId = randomUUID();
      const signedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      const ipHash = createHmac('sha256', config.relayKey).update(req.socket.remoteAddress || '').digest('hex');
      await connection.execute(`INSERT INTO otc_public_decisions
        (request_uuid,event_uuid,signer_name,signer_is_third_party,accepted,signature_png,signature_sha256,signed_at,ip_sha256,user_agent)
        VALUES (?,?,?,?,1,?,?,UTC_TIMESTAMP(6),?,?)`,
      [row.request_uuid, eventId, name, thirdParty ? 1 : 0, png, sha256(png), ipHash, String(req.headers['user-agent'] || '').slice(0, 500)]);
      await connection.execute("UPDATE otc_public_requests SET state='CONFORME',resolved_at=UTC_TIMESTAMP(6) WHERE request_uuid=?", [row.request_uuid]);
      const payload = { event_uuid: eventId, event_type: 'OTC_CONFORMIDAD', order_uuid: row.order_uuid,
        request_uuid: row.request_uuid, document_version: Number(row.document_version), document_sha256: row.document_sha256,
        evidence: { firmante: name, solicitante_original: snapshot.solicitante, firmante_es_tercero: thirdParty,
          firmado_en: signedAt, aceptacion_expresa: true, firma_png_base64: input.signature_png_base64 } };
      await connection.execute('INSERT INTO otc_public_outbox (event_uuid,request_uuid,payload_json) VALUES (?,?,?)',
        [eventId, row.request_uuid, JSON.stringify(payload)]);
      await connection.commit();
      res.json({ state: 'CONFORME', event_uuid: eventId, delivery: 'PENDING' });
    } catch (error) {
      if (connection) await connection.rollback().catch(() => {});
      if (error.code === 'ER_DUP_ENTRY') return next(new HttpError(409, 'Esta solicitud ya no admite visado'));
      next(error);
    } finally { if (connection) connection.release(); }
  });

  app.use('/assets', express.static(legacyAssets, { immutable: true, maxAge: '1d', index: false }));
  app.use(express.static(dist, { index: false }));
  app.get('/conformidad/:id', (req, res, next) => {
    if (!isUuid(req.params.id)) return next(new HttpError(404, 'Página no disponible'));
    res.sendFile(path.join(dist, 'index.html'), error => { if (error) next(error); });
  });
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    if (!error.status && !['entity.too.large', 'entity.parse.failed'].includes(error.type)) console.error('OTC web failure:', error?.code || error?.name || 'unknown');
    const status = error.status || (error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : 503);
    res.status(status).json({ error: error.status ? error.message : status === 400 ? 'JSON inválido' : status === 413 ? 'Solicitud demasiado grande' : 'Servicio temporalmente no disponible' });
  });
  return app;
}
