import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { HttpError, isUuid, sha256 } from './domain.js';

const SESSION_HOURS = 12;
const QR_HOURS = 3;
const failed = new Map();
const reject = (status, message) => { throw new HttpError(status, message); };

function cookieValue(req, key) {
  const entry = String(req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${key}=`));
  return entry ? entry.slice(key.length + 1) : '';
}

export function supportRoutes(app, db, config) {
  async function session(req) {
    const raw = cookieValue(req, 'otc_session');
    if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) reject(401, 'Inicie sesión');
    const [rows] = await db.execute(`SELECT u.local_user_id,u.username,u.display_name,u.role
      FROM otc_cloud_sessions s JOIN otc_cloud_users u ON u.local_user_id=s.local_user_id
      WHERE s.session_sha256=? AND s.expires_at>UTC_TIMESTAMP(6) AND u.active=1`, [sha256(raw)]);
    if (!rows.length) reject(401, 'Sesión vencida');
    return rows[0];
  }
  const safe = handler => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };

  app.post('/api/support/login', safe(async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = req.body?.password;
    if (!/^[A-Za-z0-9._@-]{2,50}$/.test(username) || typeof password !== 'string' || password.length > 128) reject(400, 'Credenciales no válidas');
    const key = `${req.socket.remoteAddress || ''}:${username.toLocaleLowerCase()}`;
    const attempts = failed.get(key) || [];
    const recent = attempts.filter(time => Date.now() - time < 15 * 60_000);
    if (recent.length >= 5) reject(429, 'Demasiados intentos. Espere 15 minutos');
    const [rows] = await db.execute('SELECT local_user_id,username,display_name,password_hash,role FROM otc_cloud_users WHERE username=? AND active=1', [username]);
    const valid = rows[0] && /^\$2[aby]\$/.test(rows[0].password_hash) && await bcrypt.compare(password, rows[0].password_hash);
    if (!valid) { failed.set(key, [...recent, Date.now()]); reject(401, 'Credenciales no válidas'); }
    failed.delete(key);
    const token = randomBytes(32).toString('base64url');
    await db.execute('INSERT INTO otc_cloud_sessions (session_sha256,local_user_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? HOUR))',
      [sha256(token), rows[0].local_user_id, SESSION_HOURS]);
    res.cookie('otc_session', token, { httpOnly: true, secure: config.origin.startsWith('https:'), sameSite: 'strict', path: '/', maxAge: SESSION_HOURS * 3600_000 });
    res.json({ user: { id: rows[0].local_user_id, username: rows[0].username, name: rows[0].display_name, role: rows[0].role } });
  }));

  app.post('/api/support/logout', safe(async (req, res) => {
    const token = cookieValue(req, 'otc_session');
    if (token) await db.execute('DELETE FROM otc_cloud_sessions WHERE session_sha256=?', [sha256(token)]);
    res.clearCookie('otc_session', { path: '/', secure: config.origin.startsWith('https:'), sameSite: 'strict' });
    res.json({ ok: true });
  }));

  app.get('/api/support/me', safe(async (req, res) => {
    const user = await session(req);
    res.json({ user: { id: user.local_user_id, username: user.username, name: user.display_name, role: user.role } });
  }));

  app.get('/api/support/orders', safe(async (req, res) => {
    const user = await session(req);
    const where = user.role === 'ADMIN' ? '' : ' WHERE technician_local_id=?';
    const [rows] = await db.execute(`SELECT request_uuid,order_uuid,order_code,document_version,state,expires_at,published_at,snapshot_json
      FROM otc_public_requests${where} ORDER BY published_at DESC LIMIT 200`, user.role === 'ADMIN' ? [] : [user.local_user_id]);
    res.json({ items: rows.map(row => {
      const snap = typeof row.snapshot_json === 'string' ? JSON.parse(row.snapshot_json) : row.snapshot_json;
      return { request_uuid: row.request_uuid, order_code: row.order_code, version: row.document_version,
        state: row.state, expires_at: row.expires_at, published_at: row.published_at,
        service: snap.servicio || '', requester: snap.solicitante || '', equipment: [snap.equipo?.marca, snap.equipo?.modelo].filter(Boolean).join(' ') };
    }) });
  }));

  app.post('/api/support/orders/:id/qr', safe(async (req, res) => {
    const user = await session(req);
    if (!isUuid(req.params.id)) reject(404, 'OTC no disponible');
    let connection;
    try {
      connection = await db.getConnection(); await connection.beginTransaction();
      const [rows] = await connection.execute('SELECT request_uuid,technician_local_id,state,order_code FROM otc_public_requests WHERE request_uuid=? FOR UPDATE', [req.params.id]);
      const row = rows[0];
      if (!row || user.role !== 'ADMIN' && row.technician_local_id !== user.local_user_id) reject(404, 'OTC no disponible');
      if (row.state !== 'PENDING') reject(409, 'La OTC ya no admite un QR nuevo');
      const raw = randomBytes(32).toString('base64url');
      await connection.execute('UPDATE otc_public_requests SET token_sha256=?,expires_at=DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ? HOUR) WHERE request_uuid=? AND state=\'PENDING\'',
        [sha256(raw), QR_HOURS, row.request_uuid]);
      await connection.execute('INSERT INTO otc_qr_audit (request_uuid,local_user_id,action) VALUES (?,?,?)',
        [row.request_uuid, user.local_user_id, 'QR_RENOVADO']);
      await connection.commit();
      res.json({ request_uuid: row.request_uuid, order_code: row.order_code,
        url: `${config.origin}/conformidad/${row.request_uuid}#token=${raw}`,
        expires_at: new Date(Date.now() + QR_HOURS * 3600_000).toISOString() });
    } catch (error) { if (connection) await connection.rollback().catch(() => {}); throw error; }
    finally { if (connection) connection.release(); }
  }));
}
