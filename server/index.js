import { createApp } from './app.js';
import { pool, settings } from './config.js';
import { relayOnce, validateRelayUrl } from './relay.js';

const config = settings();
if (config.relayEnabled) validateRelayUrl(config);
const db = pool(config);
const app = createApp({ db, config });
app.listen(config.port, process.env.HOST || '127.0.0.1', () => console.log(`OTC web lista en puerto ${config.port}`));
if (config.relayEnabled) {
  let busy = false;
  const cycle = async () => {
    if (busy) return;
    busy = true;
    try { await relayOnce(db, config); }
    catch (error) { console.error(`Relay pendiente: ${error.name}`); }
    finally { busy = false; }
  };
  setTimeout(cycle, 1000);
  setInterval(cycle, 15000);
}
