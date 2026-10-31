const { prisma } = require('../config/db');
const ApiError = require('./ApiError');
const { isUuid } = require('./query');

const MODELS = {
  users: 'user',
  tournaments: 'tournament',
  teams: 'team',
  players: 'player',
  matches: 'match',
};

// Loads a row only if it belongs to the caller's organization (tenant isolation)
module.exports = async (table, id, orgId, label = table, runner = prisma, lock = false) => {
  const model = MODELS[table];
  if (!model) throw new Error('Invalid table');
  if (!isUuid(id)) throw new ApiError(404, `${label} not found`);
  if (lock) {
    await runner.$queryRawUnsafe(
      `SELECT id FROM ${table} WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
      id,
      orgId
    );
  }
  const row = await runner[model].findFirst({ where: { id, organizationId: orgId } });
  if (!row) throw new ApiError(404, `${label} not found`);
  return row;
};
