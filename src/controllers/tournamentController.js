const Tournament = require('../models/Tournament');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Match = require('../models/Match');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const findOwned = require('../utils/findOwned');
const { uniqueSlug } = require('../utils/slugify');
const { str, getPagination } = require('../utils/query');
const { createLeagueFixtures, createKnockoutRound } = require('../services/fixtureService');
const { getStandings, getTopScorers } = require('../services/statsService');

exports.list = asyncHandler(async (req, res) => {
  const filter = { organization: req.orgId };
  const status = str(req.query.status);
  if (status) filter.status = status;
  const { page, limit, skip } = getPagination(req.query);

  const [data, total] = await Promise.all([
    Tournament.find(filter).sort('-createdAt').skip(skip).limit(limit),
    Tournament.countDocuments(filter),
  ]);
  res.json({ success: true, data, meta: { page, limit, total } });
});

exports.create = asyncHandler(async (req, res) => {
  const slug = await uniqueSlug(Tournament, req.body.name, { organization: req.orgId });
  const tournament = await Tournament.create({ ...req.body, organization: req.orgId, slug });
  res.status(201).json({ success: true, data: tournament });
});

exports.get = asyncHandler(async (req, res) => {
  const t = await findOwned(Tournament, req.params.id, req.orgId);
  const [teams, matches, finished] = await Promise.all([
    Team.countDocuments({ tournament: t._id }),
    Match.countDocuments({ tournament: t._id, isBye: { $ne: true } }),
    Match.countDocuments({ tournament: t._id, status: 'finished', isBye: { $ne: true } }),
  ]);
  res.json({ success: true, data: t, counts: { teams, matches, finishedMatches: finished } });
});

exports.update = asyncHandler(async (req, res) => {
  const t = await findOwned(Tournament, req.params.id, req.orgId);
  const { rules, ...rest } = req.body;
  if (rest.format && rest.format !== t.format && t.fixturesGenerated) {
    throw new ApiError(409, 'Format cannot change after fixtures are generated');
  }
  if (rules) for (const [k, v] of Object.entries(rules)) t.set(`rules.${k}`, v);
  Object.assign(t, rest);
  await t.save();
  res.json({ success: true, data: t });
});

exports.remove = asyncHandler(async (req, res) => {
  const t = await findOwned(Tournament, req.params.id, req.orgId);
  const teamIds = (await Team.find({ tournament: t._id }).select('_id')).map((x) => x._id);
  await Promise.all([
    Match.deleteMany({ tournament: t._id }),
    Player.deleteMany({ team: { $in: teamIds } }),
    Team.deleteMany({ tournament: t._id }),
  ]);
  await t.deleteOne();
  res.json({ success: true, message: 'Tournament and all related data deleted' });
});

exports.generateFixtures = asyncHandler(async (req, res) => {
  const t = await findOwned(Tournament, req.params.id, req.orgId);
  const { doubleRound, startDate, roundIntervalDays, shuffle = true, regenerate } = req.body;

  const teams = await Team.find({ tournament: t._id, organization: req.orgId }).sort('_id');
  if (teams.length < 2) throw new ApiError(400, 'At least 2 teams are required to generate fixtures');

  if (await Match.exists({ tournament: t._id })) {
    if (!regenerate) {
      throw new ApiError(409, 'Fixtures already exist. Send { "regenerate": true } to rebuild (only allowed before any match starts).');
    }
    if (await Match.exists({ tournament: t._id, status: { $in: ['live', 'finished'] } })) {
      throw new ApiError(409, 'Cannot regenerate: some matches have already started');
    }
    await Match.deleteMany({ tournament: t._id });
  }

  const matches =
    t.format === 'knockout'
      ? await createKnockoutRound(t, teams.map((x) => x._id), 1, { shuffle, startDate })
      : await createLeagueFixtures(t, teams, { doubleRound, startDate, roundIntervalDays });

  t.fixturesGenerated = true;
  t.status = 'ongoing';
  await t.save();
  res.status(201).json({ success: true, message: `${matches.length} matches created`, data: matches });
});

// Knockout only: builds the next round from the winners of the latest finished round
exports.advance = asyncHandler(async (req, res) => {
  const t = await findOwned(Tournament, req.params.id, req.orgId);
  if (t.format !== 'knockout') throw new ApiError(400, 'Only knockout tournaments can advance rounds');

  const last = await Match.findOne({ tournament: t._id }).sort('-round').select('round');
  if (!last) throw new ApiError(400, 'Generate fixtures first');

  const roundMatches = await Match.find({ tournament: t._id, round: last.round }).sort({ _id: 1 });
  if (roundMatches.some((m) => m.status !== 'finished' || !m.winner)) {
    throw new ApiError(409, 'All matches in the current round must be finished with a winner');
  }

  if (roundMatches.length === 1) {
    t.status = 'completed';
    await t.save();
    return res.json({ success: true, message: 'Tournament completed', championTeamId: roundMatches[0].winner });
  }

  const winners = roundMatches.map((m) => m.winner);
  const matches = await createKnockoutRound(t, winners, last.round + 1, { shuffle: false });
  res.status(201).json({ success: true, message: `${matches[0].roundName} created`, data: matches });
});

exports.standings = asyncHandler(async (req, res) => {
  const t = await findOwned(Tournament, req.params.id, req.orgId);
  if (t.format !== 'league') throw new ApiError(400, 'Standings are only available for league tournaments');
  res.json({ success: true, data: await getStandings(t) });
});

exports.topScorers = asyncHandler(async (req, res) => {
  const t = await findOwned(Tournament, req.params.id, req.orgId);
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
  res.json({ success: true, data: await getTopScorers(t._id, limit) });
});
