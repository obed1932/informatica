import { createApp } from './app.js';
import { pool, settings } from './config.js';

const config = settings();
const db = pool(config);
const app = createApp({ db, config });
app.listen(config.port, process.env.HOST || '127.0.0.1', () => console.log(`OTC web lista en puerto ${config.port}`));
