const { db } = require('../config/db');
const ApiError = require('./ApiError');
const { isUuid } = require('./query');

const TABLES = new Set(['users', 'tournaments', 'teams', 'players', 'matches']);

// Loads a row only if it belongs to the caller's organization (tenant isolation)
module.exports = async (table, id, orgId, label = table, runner = db, lock = false) => {
  if (!TABLES.has(table)) throw new Error('Invalid table');
  if (!isUuid(id)) throw new ApiError(404, `${label} not found`);
  const { rows } = await runner.query(
    `SELECT * FROM ${table} WHERE id = $1 AND organization_id = $2${lock ? ' FOR UPDATE' : ''}`,
    [id, orgId]
  );
  if (!rows[0]) throw new ApiError(404, `${label} not found`);
  return rows[0];
};
