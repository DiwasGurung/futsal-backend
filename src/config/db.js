const { Pool } = require('pg');
const env = require('./env');

// Neon: sslmode=require in DATABASE_URL enables TLS. Neon computes auto-suspend when idle,
// so keep the pool small, drop idle clients quickly and never crash on idle-client errors.
const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000, // allows for a cold start of a suspended Neon compute
});
pool.on('error', (err) => console.error('Idle PG client error:', err.message));

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const camelRow = (row) => {
  const out = {};
  for (const k of Object.keys(row)) out[camel(k)] = row[k];
  return out;
};

// Runner wrapper: returns rows with camelCase keys (organization_id -> organizationId)
const wrap = (runner) => ({
  async query(text, params) {
    const r = await runner.query(text, params);
    return { rows: r.rows.map(camelRow), rowCount: r.rowCount };
  },
});

const db = wrap(pool);

// Runs fn(tx) inside BEGIN/COMMIT; rolls back on error
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(wrap(client));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function connectDB() {
  try {
    const { rows } = await pool.query('SELECT current_database() AS db, version() AS v');
    console.log(`PostgreSQL connected: ${rows[0].db}`);
  } catch (err) {
    console.error('PostgreSQL connection error:', err.message);
    process.exit(1);
  }
}

module.exports = { pool, db, tx, connectDB };
