const Team = require('../models/Team');
const Player = require('../models/Player');
const Tournament = require('../models/Tournament');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const findOwned = require('../utils/findOwned');
const { id, getPagination } = require('../utils/query');
const { limitFor } = require('../middleware/planLimits');

exports.list = asyncHandler(async (req, res) => {
  const filter = { organization: req.orgId };
  const tournament = id(req.query.tournament);
  if (tournament) filter.tournament = tournament;
  const { page, limit, skip } = getPagination(req.query);

  const [data, total] = await Promise.all([
    Team.find(filter).sort('name').skip(skip).limit(limit),
    Team.countDocuments(filter),
  ]);
  res.json({ success: true, data, meta: { page, limit, total } });
});

exports.create = asyncHandler(async (req, res) => {
  const tournament = await findOwned(Tournament, req.body.tournament, req.orgId);
  if (tournament.fixturesGenerated) throw new ApiError(409, 'Cannot add teams after fixtures are generated');

  const { maxTeamsPerTournament } = limitFor(req.org);
  const count = await Team.countDocuments({ tournament: tournament._id });
  if (count >= maxTeamsPerTournament) {
    throw new ApiError(403, `Your ${req.org.plan} plan allows ${maxTeamsPerTournament} teams per tournament. Upgrade to add more.`);
  }

  const team = await Team.create({ ...req.body, organization: req.orgId });
  res.status(201).json({ success: true, data: team });
});

exports.get = asyncHandler(async (req, res) => {
  const team = await findOwned(Team, req.params.id, req.orgId);
  const players = await Player.find({ team: team._id }).sort('jerseyNumber');
  res.json({ success: true, data: team, players });
});

exports.update = asyncHandler(async (req, res) => {
  const team = await findOwned(Team, req.params.id, req.orgId);
  Object.assign(team, req.body);
  await team.save();
  res.json({ success: true, data: team });
});

exports.remove = asyncHandler(async (req, res) => {
  const team = await findOwned(Team, req.params.id, req.orgId);
  const tournament = await Tournament.findById(team.tournament);
  if (tournament?.fixturesGenerated) throw new ApiError(409, 'Cannot remove teams after fixtures are generated');
  await Player.deleteMany({ team: team._id });
  await team.deleteOne();
  res.json({ success: true, message: 'Team deleted' });
});
