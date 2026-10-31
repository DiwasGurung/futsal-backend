const { db } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const findOwned = require('../utils/findOwned');
const { uuid, getPagination } = require('../utils/query');
const { insertRow, updateRow, Where } = require('../utils/sql');
const dto = require('../utils/dto');
const { limitFor } = require('../middleware/planLimits');

const flatten = ({ manager, ...rest }) => ({
  ...rest,
  ...(rest.shortName && { shortName: rest.shortName.toUpperCase() }),
  ...(manager && { managerName: manager.name, managerPhone: manager.phone, managerEmail: manager.email }),
});

exports.list = asyncHandler(async (req, res) => {
  const where = new Where().add('organization_id = $#', req.orgId);
  const tournament = uuid(req.query.tournament);
  if (tournament) where.add('tournament_id = $#', tournament);
  const { page, limit, skip } = getPagination(req.query);

  const [rows, count] = await Promise.all([
    db.query(`SELECT * FROM teams ${where.sql} ORDER BY name LIMIT ${limit} OFFSET ${skip}`, where.params),
    db.query(`SELECT COUNT(*)::int AS total FROM teams ${where.sql}`, where.params),
  ]);
  res.json({ success: true, data: rows.rows.map(dto.team), meta: { page, limit, total: count.rows[0].total } });
});

exports.create = asyncHandler(async (req, res) => {
  const { tournament: tournamentId, ...body } = req.body;
  const tournament = await findOwned('tournaments', tournamentId, req.orgId, 'Tournament');
  if (tournament.fixturesGenerated) throw new ApiError(409, 'Cannot add teams after fixtures are generated');

  const { maxTeamsPerTournament } = limitFor(req.org);
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM teams WHERE tournament_id = $1', [tournament.id]);
  if (rows[0].n >= maxTeamsPerTournament) {
    throw new ApiError(403, `Your ${req.org.plan} plan allows ${maxTeamsPerTournament} teams per tournament. Upgrade to add more.`);
  }

  const team = await insertRow(db, 'teams', { ...flatten(body), organizationId: req.orgId, tournamentId: tournament.id });
  res.status(201).json({ success: true, data: dto.team(team) });
});

exports.get = asyncHandler(async (req, res) => {
  const team = await findOwned('teams', req.params.id, req.orgId, 'Team');
  const players = await db.query('SELECT * FROM players WHERE team_id = $1 ORDER BY jersey_number', [team.id]);
  res.json({ success: true, data: dto.team(team), players: players.rows });
});

exports.update = asyncHandler(async (req, res) => {
  const team = await findOwned('teams', req.params.id, req.orgId, 'Team');
  const row = await updateRow(db, 'teams', team.id, flatten(req.body));
  res.json({ success: true, data: dto.team(row) });
});

exports.remove = asyncHandler(async (req, res) => {
  const team = await findOwned('teams', req.params.id, req.orgId, 'Team');
  const t = await db.query('SELECT fixtures_generated FROM tournaments WHERE id = $1', [team.tournamentId]);
  if (t.rows[0]?.fixturesGenerated) throw new ApiError(409, 'Cannot remove teams after fixtures are generated');
  await db.query('DELETE FROM teams WHERE id = $1', [team.id]); // players cascade
  res.json({ success: true, message: 'Team deleted' });
});
