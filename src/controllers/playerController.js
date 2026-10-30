const Player = require('../models/Player');
const Team = require('../models/Team');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const findOwned = require('../utils/findOwned');
const { id, getPagination } = require('../utils/query');

exports.list = asyncHandler(async (req, res) => {
  const filter = { organization: req.orgId };
  const team = id(req.query.team);
  if (team) filter.team = team;
  const { page, limit, skip } = getPagination(req.query, 100);

  const [data, total] = await Promise.all([
    Player.find(filter).sort('jerseyNumber').skip(skip).limit(limit),
    Player.countDocuments(filter),
  ]);
  res.json({ success: true, data, meta: { page, limit, total } });
});

exports.create = asyncHandler(async (req, res) => {
  const team = await findOwned(Team, req.body.team, req.orgId);
  if (await Player.exists({ team: team._id, jerseyNumber: req.body.jerseyNumber })) {
    throw new ApiError(409, 'Jersey number already taken in this team');
  }
  const player = await Player.create({ ...req.body, organization: req.orgId });
  res.status(201).json({ success: true, data: player });
});

exports.get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await findOwned(Player, req.params.id, req.orgId) });
});

exports.update = asyncHandler(async (req, res) => {
  const player = await findOwned(Player, req.params.id, req.orgId);
  if (
    req.body.jerseyNumber !== undefined &&
    req.body.jerseyNumber !== player.jerseyNumber &&
    (await Player.exists({ team: player.team, jerseyNumber: req.body.jerseyNumber }))
  ) {
    throw new ApiError(409, 'Jersey number already taken in this team');
  }
  Object.assign(player, req.body);
  await player.save();
  res.json({ success: true, data: player });
});

exports.remove = asyncHandler(async (req, res) => {
  const player = await findOwned(Player, req.params.id, req.orgId);
  await player.deleteOne();
  res.json({ success: true, message: 'Player deleted' });
});
