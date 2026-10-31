const { db } = require('../config/db');

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Unique slug within a table; optional scope = { column, value } e.g. organization_id
async function uniqueSlug(table, base, scope = null, runner = db) {
  if (!['organizations', 'tournaments'].includes(table)) throw new Error('Invalid table');
  const root = slugify(base) || 'item';
  let candidate = root;
  let i = 1;
  for (;;) {
    const params = [candidate];
    let sql = `SELECT 1 FROM ${table} WHERE slug = $1`;
    if (scope) {
      sql += ' AND organization_id = $2';
      params.push(scope);
    }
    const { rowCount } = await runner.query(sql, params);
    if (!rowCount) return candidate;
    candidate = `${root}-${++i}`;
  }
}

module.exports = { slugify, uniqueSlug };
