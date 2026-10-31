const { db } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const findOwned = require('../utils/findOwned');
const { uuid, getPagination } = require('../utils/query');
const { insertRow, updateRow, Where } = require('../utils/sql');

exports.list = asyncHandler(async (req, res) => {
  const where = new Where().add('organization_id = $#', req.orgId);
  const team = uuid(req.query.team);
  if (team) where.add('team_id = $#', team);
  const { page, limit, skip } = getPagination(req.query, 100);

  const [rows, count] = await Promise.all([
    db.query(`SELECT * FROM players ${where.sql} ORDER BY jersey_number LIMIT ${limit} OFFSET ${skip}`, where.params),
    db.query(`SELECT COUNT(*)::int AS total FROM players ${where.sql}`, where.params),
  ]);
  res.json({ success: true, data: rows.rows, meta: { page, limit, total: count.rows[0].total } });
});

exports.create = asyncHandler(async (req, res) => {
  const { team: teamId, ...body } = req.body;
  const team = await findOwned('teams', teamId, req.orgId, 'Team');
  const dup = await db.query('SELECT 1 FROM players WHERE team_id = $1 AND jersey_number = $2', [team.id, body.jerseyNumber]);
  if (dup.rowCount) throw new ApiError(409, 'Jersey number already taken in this team');

  const player = await insertRow(db, 'players', { ...body, organizationId: req.orgId, teamId: team.id });
  res.status(201).json({ success: true, data: player });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await findOwned('players', req.params.id, req.orgId, 'Player') });
});

exports.update = asyncHandler(async (req, res) => {
  const player = await findOwned('players', req.params.id, req.orgId, 'Player');
  if (req.body.jerseyNumber !== undefined && req.body.jerseyNumber !== player.jerseyNumber) {
    const dup = await db.query('SELECT 1 FROM players WHERE team_id = $1 AND jersey_number = $2', [player.teamId, req.body.jerseyNumber]);
    if (dup.rowCount) throw new ApiError(409, 'Jersey number already taken in this team');
  }
  res.json({ success: true, data: await updateRow(db, 'players', player.id, req.body) });
});

exports.remove = asyncHandler(async (req, res) => {
  const player = await findOwned('players', req.params.id, req.orgId, 'Player');
  await db.query('DELETE FROM players WHERE id = $1', [player.id]);
  res.json({ success: true, message: 'Player deleted' });
});
