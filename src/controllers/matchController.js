const { prisma, tx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const findOwned = require('../utils/findOwned');
const { getPagination, applyMatchFilters } = require('../utils/query');
const { listMatches, getMatchDetail } = require('../services/matchQueries');

const withStringSeq = (match) => ({ ...match, seq: match.seq.toString() });

const recomputeScore = async (transaction, match) => {
  const events = await transaction.matchEvent.groupBy({
    by: ['type', 'teamId'],
    where: { matchId: match.id, type: { in: ['goal', 'own_goal'] } },
    _count: { _all: true },
  });
  let homeScore = 0;
  let awayScore = 0;
  for (const event of events) {
    if (event.type === 'goal') {
      if (event.teamId === match.homeTeamId) homeScore += event._count._all;
      else if (event.teamId === match.awayTeamId) awayScore += event._count._all;
    } else if (event.teamId === match.awayTeamId) homeScore += event._count._all;
    else if (event.teamId === match.homeTeamId) awayScore += event._count._all;
  }
  await transaction.match.update({
    where: { id: match.id },
    data: { homeScore, awayScore },
  });
  return { homeScore, awayScore };
};

exports.list = asyncHandler(async (req, res) => {
  const where = { organizationId: req.orgId };
  applyMatchFilters(where, req.query);
  const { page, limit, skip } = getPagination(req.query);
  const { data, total } = await listMatches(where, { limit, skip });
  res.json({ success: true, data, meta: { page, limit, total } });
});

exports.get = asyncHandler(async (req, res) => {
  const match = await getMatchDetail(req.params.id, req.orgId);
  if (!match) throw new ApiError(404, 'Match not found');
  res.json({ success: true, data: match });
});

exports.update = asyncHandler(async (req, res) => {
  const match = await findOwned('matches', req.params.id, req.orgId, 'Match');
  if (['live', 'finished'].includes(match.status)) {
    throw new ApiError(409, 'Cannot edit schedule of a live or finished match');
  }
  const updated = await prisma.match.update({ where: { id: match.id }, data: req.body });
  res.json({ success: true, data: withStringSeq(updated) });
});

exports.start = asyncHandler(async (req, res) => {
  const match = await findOwned('matches', req.params.id, req.orgId, 'Match');
  if (match.isBye) throw new ApiError(400, 'Bye matches cannot be played');
  if (match.status !== 'scheduled') throw new ApiError(409, `Match is already ${match.status}`);
  const updated = await prisma.match.update({ where: { id: match.id }, data: { status: 'live' } });
  res.json({ success: true, data: withStringSeq(updated) });
});

exports.addEvent = asyncHandler(async (req, res) => {
  const { type, team, player, minute } = req.body;

  const result = await tx(async (t) => {
    const match = await findOwned('matches', req.params.id, req.orgId, 'Match', t, true); // row lock
    if (match.status !== 'live') throw new ApiError(409, 'Match must be live to record events');
    if (![match.homeTeamId, match.awayTeamId].includes(team)) throw new ApiError(400, 'Team is not part of this match');
    if (type !== 'own_goal' && !player) throw new ApiError(400, 'player is required for this event type');
    if (player) {
      const ok = await t.player.findFirst({
        where: { id: player, teamId: team, organizationId: req.orgId },
        select: { id: true },
      });
      if (!ok) throw new ApiError(400, 'Player does not belong to that team');
    }
    const event = await t.matchEvent.create({
      data: { matchId: match.id, type, teamId: team, playerId: player ?? null, minute },
    });
    const score = await recomputeScore(t, match);
    return { event, ...score };
  });
  res.status(201).json({ success: true, data: result });
});

exports.removeEvent = asyncHandler(async (req, res) => {
  const result = await tx(async (t) => {
    const match = await findOwned('matches', req.params.id, req.orgId, 'Match', t, true);
    if (match.status !== 'live') throw new ApiError(409, 'Match must be live to edit events');
    const deleted = await t.matchEvent.deleteMany({ where: { id: req.params.eventId, matchId: match.id } });
    if (!deleted.count) throw new ApiError(404, 'Event not found');
    return recomputeScore(t, match);
  });
  res.json({ success: true, data: result });
});

exports.finish = asyncHandler(async (req, res) => {
  const match = await tx(async (t) => {
    const m = await findOwned('matches', req.params.id, req.orgId, 'Match', t, true);
    if (m.status !== 'live') throw new ApiError(409, 'Only a live match can be finished');
    const tournament = await t.tournament.findUnique({
      where: { id: m.tournamentId },
      select: { format: true },
    });

    let winnerId = null;
    let penaltyHome = null;
    let penaltyAway = null;
    if (m.homeScore !== m.awayScore) {
      winnerId = m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId;
    } else if (tournament.format === 'knockout') {
      ({ penaltyHome, penaltyAway } = req.body);
      if (penaltyHome == null || penaltyAway == null || penaltyHome === penaltyAway) {
        throw new ApiError(400, 'Knockout draws need a penalty shootout result with a clear winner (penaltyHome, penaltyAway)');
      }
      winnerId = penaltyHome > penaltyAway ? m.homeTeamId : m.awayTeamId;
    } // league draw: no winner

    const updated = await t.match.update({
      where: { id: m.id },
      data: { status: 'finished', winnerId, penaltyHome, penaltyAway },
    });
    return withStringSeq(updated);
  });
  res.json({ success: true, data: match });
});

// Lets admins correct a finished match
exports.reopen = asyncHandler(async (req, res) => {
  const match = await findOwned('matches', req.params.id, req.orgId, 'Match');
  if (match.status !== 'finished' || match.isBye) throw new ApiError(409, 'Only finished matches can be reopened');
  const later = await prisma.match.count({
    where: { tournamentId: match.tournamentId, round: { gt: match.round } },
  });
  if (later) throw new ApiError(409, 'Cannot reopen: a later round has already been generated');

  const updated = await prisma.match.update({
    where: { id: match.id },
    data: { status: 'live', winnerId: null, penaltyHome: null, penaltyAway: null },
  });
  res.json({ success: true, data: withStringSeq(updated) });
});
