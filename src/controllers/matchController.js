const Match = require('../models/Match');
const Player = require('../models/Player');
const Tournament = require('../models/Tournament');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const findOwned = require('../utils/findOwned');
const { getPagination, matchFilter } = require('../utils/query');

const TEAM_FIELDS = 'name shortName logoUrl';

// Score is always derived from events, so it can never drift out of sync
const recomputeScore = (match) => {
  let home = 0;
  let away = 0;
  for (const e of match.events) {
    const isHome = String(e.team) === String(match.homeTeam);
    if (e.type === 'goal') isHome ? home++ : away++;
    else if (e.type === 'own_goal') isHome ? away++ : home++;
  }
  match.homeScore = home;
  match.awayScore = away;
};

exports.list = asyncHandler(async (req, res) => {
  const filter = { ...matchFilter(req.query), organization: req.orgId };
  const { page, limit, skip } = getPagination(req.query);

  const [data, total] = await Promise.all([
    Match.find(filter)
      .select('-events')
      .populate('homeTeam awayTeam', TEAM_FIELDS)
      .sort({ round: 1, scheduledAt: 1, _id: 1 })
      .skip(skip)
      .limit(limit),
    Match.countDocuments(filter),
  ]);
  res.json({ success: true, data, meta: { page, limit, total } });
});

exports.get = asyncHandler(async (req, res) => {
  const match = await findOwned(Match, req.params.id, req.orgId);
  await match.populate([
    { path: 'homeTeam awayTeam', select: TEAM_FIELDS },
    { path: 'events.player', select: 'name jerseyNumber' },
  ]);
  res.json({ success: true, data: match });
});

exports.update = asyncHandler(async (req, res) => {
  const match = await findOwned(Match, req.params.id, req.orgId);
  if (['live', 'finished'].includes(match.status)) {
    throw new ApiError(409, 'Cannot edit schedule of a live or finished match');
  }
  Object.assign(match, req.body);
  await match.save();
  res.json({ success: true, data: match });
});

exports.start = asyncHandler(async (req, res) => {
  const match = await findOwned(Match, req.params.id, req.orgId);
  if (match.isBye) throw new ApiError(400, 'Bye matches cannot be played');
  if (match.status !== 'scheduled') throw new ApiError(409, `Match is already ${match.status}`);
  match.status = 'live';
  await match.save();
  res.json({ success: true, data: match });
});

exports.addEvent = asyncHandler(async (req, res) => {
  const match = await findOwned(Match, req.params.id, req.orgId);
  if (match.status !== 'live') throw new ApiError(409, 'Match must be live to record events');

  const { type, team, player, minute } = req.body;
  if (![String(match.homeTeam), String(match.awayTeam)].includes(String(team))) {
    throw new ApiError(400, 'Team is not part of this match');
  }
  if (type !== 'own_goal' && !player) throw new ApiError(400, 'player is required for this event type');
  if (player && !(await Player.exists({ _id: player, team, organization: req.orgId }))) {
    throw new ApiError(400, 'Player does not belong to that team');
  }

  match.events.push({ type, team, player, minute });
  recomputeScore(match);
  await match.save();
  res.status(201).json({
    success: true,
    data: { homeScore: match.homeScore, awayScore: match.awayScore, event: match.events[match.events.length - 1] },
  });
});

exports.removeEvent = asyncHandler(async (req, res) => {
  const match = await findOwned(Match, req.params.id, req.orgId);
  if (match.status !== 'live') throw new ApiError(409, 'Match must be live to edit events');
  if (!match.events.id(req.params.eventId)) throw new ApiError(404, 'Event not found');

  match.events.pull({ _id: req.params.eventId });
  recomputeScore(match);
  await match.save();
  res.json({ success: true, data: { homeScore: match.homeScore, awayScore: match.awayScore } });
});

exports.finish = asyncHandler(async (req, res) => {
  const match = await findOwned(Match, req.params.id, req.orgId);
  if (match.status !== 'live') throw new ApiError(409, 'Only a live match can be finished');
  const tournament = await Tournament.findById(match.tournament);

  if (match.homeScore !== match.awayScore) {
    match.winner = match.homeScore > match.awayScore ? match.homeTeam : match.awayTeam;
  } else if (tournament.format === 'knockout') {
    const { penaltyHome, penaltyAway } = req.body;
    if (penaltyHome == null || penaltyAway == null || penaltyHome === penaltyAway) {
      throw new ApiError(400, 'Knockout draws need a penalty shootout result with a clear winner (penaltyHome, penaltyAway)');
    }
    match.penaltyHome = penaltyHome;
    match.penaltyAway = penaltyAway;
    match.winner = penaltyHome > penaltyAway ? match.homeTeam : match.awayTeam;
  } else {
    match.winner = undefined; // league draw
  }

  match.status = 'finished';
  await match.save();
  res.json({ success: true, data: match });
});

// Lets admins correct a finished match
exports.reopen = asyncHandler(async (req, res) => {
  const match = await findOwned(Match, req.params.id, req.orgId);
  if (match.status !== 'finished' || match.isBye) throw new ApiError(409, 'Only finished matches can be reopened');
  if (await Match.exists({ tournament: match.tournament, round: { $gt: match.round } })) {
    throw new ApiError(409, 'Cannot reopen: a later round has already been generated');
  }
  match.status = 'live';
  match.winner = undefined;
  match.penaltyHome = undefined;
  match.penaltyAway = undefined;
  await match.save();
  res.json({ success: true, data: match });
});
