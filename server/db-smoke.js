import { pool, settings } from './config.js';

const db = pool(settings());
try {
  const [tables] = await db.query("SHOW TABLES LIKE 'otc_%'");
  if (tables.length < 6) throw new Error(`Se esperaban al menos 6 tablas OTC; encontradas ${tables.length}`);
  const [rows] = await db.query('SELECT COUNT(*) AS total FROM otc_public_requests');
  console.log(`MariaDB OTC: ${tables.length} tablas accesibles; solicitudes de laboratorio: ${rows[0].total}`);
} finally { await db.end(); }
