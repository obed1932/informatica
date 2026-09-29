import 'dotenv/config';
import mysql from 'mysql2/promise';

export function settings(env = process.env) {
  const required = ['OTC_DB_HOST', 'OTC_DB_NAME', 'OTC_DB_USER', 'OTC_DB_PASSWORD', 'OTC_SITE_ORIGIN', 'OTC_RELAY_HMAC_KEY'];
  for (const name of required) if (!env[name] || env[name].startsWith('REPLACE_')) throw new Error(`${name} no configurado`);
  if (env.OTC_RELAY_HMAC_KEY.length < 32) throw new Error('OTC_RELAY_HMAC_KEY demasiado corta');
  const origin = new URL(env.OTC_SITE_ORIGIN);
  if (origin.pathname !== '/' || origin.search || origin.hash) throw new Error('OTC_SITE_ORIGIN debe ser un origen');
  return {
    port: Number(env.PORT || 8101),
    db: { host: env.OTC_DB_HOST, port: Number(env.OTC_DB_PORT || 3306), database: env.OTC_DB_NAME,
      user: env.OTC_DB_USER, password: env.OTC_DB_PASSWORD, timezone: 'Z', dateStrings: true,
      waitForConnections: true, connectionLimit: 8, multipleStatements: false },
    origin: origin.origin,
    relayUrl: env.OTC_RELAY_URL || '', relayKey: env.OTC_RELAY_HMAC_KEY,
    relayEnabled: env.OTC_RELAY_ENABLED === 'true',
  };
}

export function pool(config) { return mysql.createPool(config.db); }
