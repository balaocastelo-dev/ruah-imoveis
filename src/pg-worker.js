// Worker que conversa com o Postgres (usado por db-pg.js).
const { runAsWorker } = require('synckit');
const { Pool, types } = require('pg');

types.setTypeParser(20, (v) => (v === null ? null : Number(v)));   // bigint (count, sum)
types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric

let pool;
function abre() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL || require('./config').DATABASE_URL;
  pool = new Pool({
    connectionString: url.replace(/[?&]sslmode=[^&]*/, ''),
    ssl: /sslmode=disable/.test(url) ? false : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX || 3),
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 15000,
  });
  pool.on('error', () => {});
  return pool;
}

runAsWorker(async (text, params) => {
  const p = params.map((v) => (v instanceof Uint8Array && !Buffer.isBuffer(v) ? Buffer.from(v) : v));
  for (let tentativa = 0; ; tentativa++) {
    try {
      const r = await abre().query(text, p);
      return { rows: r.rows || [], rowCount: r.rowCount || 0 };
    } catch (e) {
      const conexao = /ECONNRESET|ETIMEDOUT|terminat|Connection|socket/i.test(String(e.message)) && !e.code?.match(/^[0-9A-Z]{5}$/);
      if (conexao && tentativa < 2) { try { await pool.end(); } catch {} pool = null; continue; }
      return { rows: [], rowCount: 0, erro: { message: e.message, code: e.code, detail: e.detail, constraint: e.constraint } };
    }
  }
});
