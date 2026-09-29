import { pool, settings } from './config.js';

const db = pool(settings());
try {
  const [tables] = await db.query("SHOW TABLES LIKE 'otc_public_%'");
  if (tables.length !== 3) throw new Error(`Se esperaban 3 tablas OTC; encontradas ${tables.length}`);
  const [rows] = await db.query('SELECT COUNT(*) AS total FROM otc_public_requests');
  console.log(`MariaDB OTC: 3 tablas accesibles; solicitudes de laboratorio: ${rows[0].total}`);
} finally { await db.end(); }
