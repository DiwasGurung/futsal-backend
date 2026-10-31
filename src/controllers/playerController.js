const { prisma } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const findOwned = require('../utils/findOwned');
const { uuid, getPagination } = require('../utils/query');
const dto = require('../utils/dto');

exports.list = asyncHandler(async (req, res) => {
  const where = { organizationId: req.orgId };
  const team = uuid(req.query.team);
  if (team) where.teamId = team;
  const { page, limit, skip } = getPagination(req.query, 100);

  const [rows, total] = await Promise.all([
    prisma.player.findMany({ where, orderBy: { jerseyNumber: 'asc' }, take: limit, skip }),
    prisma.player.count({ where }),
  ]);
  res.json({ success: true, data: rows.map(dto.player), meta: { page, limit, total } });
});

exports.create = asyncHandler(async (req, res) => {
  const { team: teamId, ...body } = req.body;
  const team = await findOwned('teams', teamId, req.orgId, 'Team');
  const duplicate = await prisma.player.findUnique({
    where: { teamId_jerseyNumber: { teamId: team.id, jerseyNumber: body.jerseyNumber } },
    select: { id: true },
  });
  if (duplicate) throw new ApiError(409, 'Jersey number already taken in this team');

  const player = await prisma.player.create({ data: { ...body, organizationId: req.orgId, teamId: team.id } });
  res.status(201).json({ success: true, data: dto.player(player) });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: dto.player(await findOwned('players', req.params.id, req.orgId, 'Player')) });
});

exports.update = asyncHandler(async (req, res) => {
  const player = await findOwned('players', req.params.id, req.orgId, 'Player');
  if (req.body.jerseyNumber !== undefined && req.body.jerseyNumber !== player.jerseyNumber) {
    const duplicate = await prisma.player.findUnique({
      where: { teamId_jerseyNumber: { teamId: player.teamId, jerseyNumber: req.body.jerseyNumber } },
      select: { id: true },
    });
    if (duplicate && duplicate.id !== player.id) throw new ApiError(409, 'Jersey number already taken in this team');
  }
  const updated = await prisma.player.update({ where: { id: player.id }, data: req.body });
  res.json({ success: true, data: dto.player(updated) });
});

exports.remove = asyncHandler(async (req, res) => {
  const player = await findOwned('players', req.params.id, req.orgId, 'Player');
  await prisma.player.delete({ where: { id: player.id } });
  res.json({ success: true, message: 'Player deleted' });
});
