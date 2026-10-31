const { prisma, tx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const findOwned = require('../utils/findOwned');
const { uniqueSlug } = require('../utils/slugify');
const { str, getPagination } = require('../utils/query');
const dto = require('../utils/dto');
const { createLeagueFixtures, createKnockoutRound } = require('../services/fixtureService');
const { getStandings, getTopScorers } = require('../services/statsService');

exports.list = asyncHandler(async (req, res) => {
  const where = { organizationId: req.orgId };
  const status = str(req.query.status);
  if (status) where.status = status;
  const { page, limit, skip } = getPagination(req.query);

  const [rows, total] = await Promise.all([
    prisma.tournament.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, skip }),
    prisma.tournament.count({ where }),
  ]);
  res.json({ success: true, data: rows.map(dto.tournament), meta: { page, limit, total } });
});

exports.create = asyncHandler(async (req, res) => {
  const { rules = {}, ...rest } = req.body;
  const slug = await uniqueSlug('tournaments', rest.name, req.orgId);
  const row = await prisma.tournament.create({
    data: { ...rest, ...rules, organizationId: req.orgId, slug },
  });
  res.status(201).json({ success: true, data: dto.tournament(row) });
});

exports.get = asyncHandler(async (req, res) => {
  const t = await findOwned('tournaments', req.params.id, req.orgId, 'Tournament');
  const [teams, matches, finishedMatches] = await Promise.all([
    prisma.team.count({ where: { tournamentId: t.id } }),
    prisma.match.count({ where: { tournamentId: t.id, isBye: false } }),
    prisma.match.count({ where: { tournamentId: t.id, isBye: false, status: 'finished' } }),
  ]);
  res.json({ success: true, data: dto.tournament(t), counts: { teams, matches, finishedMatches } });
});

exports.update = asyncHandler(async (req, res) => {
  const t = await findOwned('tournaments', req.params.id, req.orgId, 'Tournament');
  const { rules = {}, ...rest } = req.body;
  if (rest.format && rest.format !== t.format && t.fixturesGenerated) {
    throw new ApiError(409, 'Format cannot change after fixtures are generated');
  }
  const row = await prisma.tournament.update({ where: { id: t.id }, data: { ...rest, ...rules } });
  res.json({ success: true, data: dto.tournament(row) });
});

exports.remove = asyncHandler(async (req, res) => {
  const t = await findOwned('tournaments', req.params.id, req.orgId, 'Tournament');
  await prisma.tournament.delete({ where: { id: t.id } });
  res.json({ success: true, message: 'Tournament and all related data deleted' });
});

exports.generateFixtures = asyncHandler(async (req, res) => {
  const { doubleRound, startDate, roundIntervalDays, shuffle = true, regenerate } = req.body;

  const matches = await tx(async (t) => {
    // lock the tournament row so two admins can't generate at the same time
    const tournament = await findOwned('tournaments', req.params.id, req.orgId, 'Tournament', t, true);

    const teams = await t.team.findMany({
      where: { tournamentId: tournament.id },
      select: { id: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (teams.length < 2) throw new ApiError(400, 'At least 2 teams are required to generate fixtures');
    const teamIds = teams.map((x) => x.id);

    const existing = await t.match.count({ where: { tournamentId: tournament.id } });
    if (existing) {
      if (!regenerate) {
        throw new ApiError(409, 'Fixtures already exist. Send { "regenerate": true } to rebuild (only allowed before any match starts).');
      }
      const started = await t.match.count({
        where: { tournamentId: tournament.id, status: { in: ['live', 'finished'] } },
      });
      if (started) throw new ApiError(409, 'Cannot regenerate: some matches have already started');
      await t.match.deleteMany({ where: { tournamentId: tournament.id } });
    }

    const created =
      tournament.format === 'knockout'
        ? await createKnockoutRound(t, tournament, teamIds, 1, { shuffle, startDate })
        : await createLeagueFixtures(t, tournament, teamIds, { doubleRound, startDate, roundIntervalDays });

    await t.tournament.update({
      where: { id: tournament.id },
      data: { fixturesGenerated: true, status: 'ongoing' },
    });
    return created;
  });

  res.status(201).json({ success: true, message: `${matches.length} matches created`, data: matches });
});

// Knockout only: builds the next round from the winners of the latest finished round
exports.advance = asyncHandler(async (req, res) => {
  const result = await tx(async (t) => {
    const tournament = await findOwned('tournaments', req.params.id, req.orgId, 'Tournament', t, true);
    if (tournament.format !== 'knockout') throw new ApiError(400, 'Only knockout tournaments can advance rounds');

    const { _max } = await t.match.aggregate({
      where: { tournamentId: tournament.id },
      _max: { round: true },
    });
    const last = _max.round;
    if (!last) throw new ApiError(400, 'Generate fixtures first');

    const current = await t.match.findMany({
      where: { tournamentId: tournament.id, round: last },
      orderBy: { seq: 'asc' },
    });
    if (current.some((m) => m.status !== 'finished' || !m.winnerId)) {
      throw new ApiError(409, 'All matches in the current round must be finished with a winner');
    }

    if (current.length === 1) {
      await t.tournament.update({ where: { id: tournament.id }, data: { status: 'completed' } });
      return { completed: true, championTeamId: current[0].winnerId };
    }
    const created = await createKnockoutRound(t, tournament, current.map((m) => m.winnerId), last + 1, { shuffle: false });
    return { completed: false, created };
  });

  if (result.completed) {
    return res.json({ success: true, message: 'Tournament completed', championTeamId: result.championTeamId });
  }
  res.status(201).json({ success: true, message: `${result.created[0].roundName} created`, data: result.created });
});

exports.standings = asyncHandler(async (req, res) => {
  const t = await findOwned('tournaments', req.params.id, req.orgId, 'Tournament');
  if (t.format !== 'league') throw new ApiError(400, 'Standings are only available for league tournaments');
  res.json({ success: true, data: await getStandings(t.id) });
});

exports.topScorers = asyncHandler(async (req, res) => {
  const t = await findOwned('tournaments', req.params.id, req.orgId, 'Tournament');
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
  res.json({ success: true, data: await getTopScorers(t.id, limit) });
});
