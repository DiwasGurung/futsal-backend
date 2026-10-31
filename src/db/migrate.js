// Usage: npm run migrate  -> applies src/db/schema.sql to DATABASE_URL (safe to re-run)
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Schema applied.');
  await pool.end();
})().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
