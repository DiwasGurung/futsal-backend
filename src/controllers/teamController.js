const { prisma } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const findOwned = require('../utils/findOwned');
const { uuid, getPagination } = require('../utils/query');
const dto = require('../utils/dto');
const { limitFor } = require('../middleware/planLimits');

const flatten = ({ manager, ...rest }) => ({
  ...rest,
  ...(rest.shortName && { shortName: rest.shortName.toUpperCase() }),
  ...(manager && { managerName: manager.name, managerPhone: manager.phone, managerEmail: manager.email }),
});

exports.list = asyncHandler(async (req, res) => {
  const where = { organizationId: req.orgId };
  const tournament = uuid(req.query.tournament);
  if (tournament) where.tournamentId = tournament;
  const { page, limit, skip } = getPagination(req.query);

  const [rows, total] = await Promise.all([
    prisma.team.findMany({ where, orderBy: { name: 'asc' }, take: limit, skip }),
    prisma.team.count({ where }),
  ]);
  res.json({ success: true, data: rows.map(dto.team), meta: { page, limit, total } });
});

exports.create = asyncHandler(async (req, res) => {
  const { tournament: tournamentId, ...body } = req.body;
  const tournament = await findOwned('tournaments', tournamentId, req.orgId, 'Tournament');
  if (tournament.fixturesGenerated) throw new ApiError(409, 'Cannot add teams after fixtures are generated');

  const { maxTeamsPerTournament } = limitFor(req.org);
  const teamCount = await prisma.team.count({ where: { tournamentId: tournament.id } });
  if (teamCount >= maxTeamsPerTournament) {
    throw new ApiError(403, `Your ${req.org.plan} plan allows ${maxTeamsPerTournament} teams per tournament. Upgrade to add more.`);
  }

  const team = await prisma.team.create({
    data: { ...flatten(body), organizationId: req.orgId, tournamentId: tournament.id },
  });
  res.status(201).json({ success: true, data: dto.team(team) });
});

exports.get = asyncHandler(async (req, res) => {
  const team = await findOwned('teams', req.params.id, req.orgId, 'Team');
  const players = await prisma.player.findMany({ where: { teamId: team.id }, orderBy: { jerseyNumber: 'asc' } });
  res.json({ success: true, data: dto.team(team), players: players.map(dto.player) });
});

exports.update = asyncHandler(async (req, res) => {
  const team = await findOwned('teams', req.params.id, req.orgId, 'Team');
  const row = await prisma.team.update({ where: { id: team.id }, data: flatten(req.body) });
  res.json({ success: true, data: dto.team(row) });
});

exports.remove = asyncHandler(async (req, res) => {
  const team = await findOwned('teams', req.params.id, req.orgId, 'Team');
  const tournament = await prisma.tournament.findUnique({
    where: { id: team.tournamentId },
    select: { fixturesGenerated: true },
  });
  if (tournament?.fixturesGenerated) throw new ApiError(409, 'Cannot remove teams after fixtures are generated');
  await prisma.team.delete({ where: { id: team.id } });
  res.json({ success: true, message: 'Team deleted' });
});
