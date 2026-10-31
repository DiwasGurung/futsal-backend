const { db, tx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const findOwned = require('../utils/findOwned');
const { uniqueSlug } = require('../utils/slugify');
const { str, getPagination } = require('../utils/query');
const { insertRow, updateRow, Where } = require('../utils/sql');
const dto = require('../utils/dto');
const { createLeagueFixtures, createKnockoutRound } = require('../services/fixtureService');
const { getStandings, getTopScorers } = require('../services/statsService');

exports.list = asyncHandler(async (req, res) => {
  const where = new Where().add('organization_id = $#', req.orgId);
  const status = str(req.query.status);
  if (status) where.add('status = $#', status);
  const { page, limit, skip } = getPagination(req.query);

  const [rows, count] = await Promise.all([
    db.query(`SELECT * FROM tournaments ${where.sql} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${skip}`, where.params),
    db.query(`SELECT COUNT(*)::int AS total FROM tournaments ${where.sql}`, where.params),
  ]);
  res.json({ success: true, data: rows.rows.map(dto.tournament), meta: { page, limit, total: count.rows[0].total } });
});

exports.create = asyncHandler(async (req, res) => {
  const { rules = {}, ...rest } = req.body;
  const slug = await uniqueSlug('tournaments', rest.name, req.orgId);
  const row = await insertRow(db, 'tournaments', { ...rest, ...rules, organizationId: req.orgId, slug });
  res.status(201).json({ success: true, data: dto.tournament(row) });
});

exports.get = asyncHandler(async (req, res) => {
  const t = await findOwned('tournaments', req.params.id, req.orgId, 'Tournament');
  const { rows } = await db.query(
    `SELECT (SELECT COUNT(*)::int FROM teams   WHERE tournament_id = $1) AS teams,
            (SELECT COUNT(*)::int FROM matches WHERE tournament_id = $1 AND NOT is_bye) AS matches,
            (SELECT COUNT(*)::int FROM matches WHERE tournament_id = $1 AND NOT is_bye AND status = 'finished') AS finished_matches`,
    [t.id]
  );
  res.json({ success: true, data: dto.tournament(t), counts: rows[0] });
});

exports.update = asyncHandler(async (req, res) => {
  const t = await findOwned('tournaments', req.params.id, req.orgId, 'Tournament');
  const { rules = {}, ...rest } = req.body;
  if (rest.format && rest.format !== t.format && t.fixturesGenerated) {
    throw new ApiError(409, 'Format cannot change after fixtures are generated');
  }
  const row = await updateRow(db, 'tournaments', t.id, { ...rest, ...rules });
  res.json({ success: true, data: dto.tournament(row) });
});

exports.remove = asyncHandler(async (req, res) => {
  const t = await findOwned('tournaments', req.params.id, req.orgId, 'Tournament');
  await db.query('DELETE FROM tournaments WHERE id = $1', [t.id]); // cascades to teams/players/matches/events
  res.json({ success: true, message: 'Tournament and all related data deleted' });
});

exports.generateFixtures = asyncHandler(async (req, res) => {
  const { doubleRound, startDate, roundIntervalDays, shuffle = true, regenerate } = req.body;

  const matches = await tx(async (t) => {
    // lock the tournament row so two admins can't generate at the same time
    const tournament = await findOwned('tournaments', req.params.id, req.orgId, 'Tournament', t, true);

    const teams = await t.query('SELECT id FROM teams WHERE tournament_id = $1 ORDER BY created_at, id', [tournament.id]);
    if (teams.rowCount < 2) throw new ApiError(400, 'At least 2 teams are required to generate fixtures');
    const teamIds = teams.rows.map((x) => x.id);

    const existing = await t.query('SELECT 1 FROM matches WHERE tournament_id = $1 LIMIT 1', [tournament.id]);
    if (existing.rowCount) {
      if (!regenerate) {
        throw new ApiError(409, 'Fixtures already exist. Send { "regenerate": true } to rebuild (only allowed before any match starts).');
      }
      const started = await t.query(
        "SELECT 1 FROM matches WHERE tournament_id = $1 AND status IN ('live','finished') LIMIT 1", [tournament.id]);
      if (started.rowCount) throw new ApiError(409, 'Cannot regenerate: some matches have already started');
      await t.query('DELETE FROM matches WHERE tournament_id = $1', [tournament.id]);
    }

    const created =
      tournament.format === 'knockout'
        ? await createKnockoutRound(t, tournament, teamIds, 1, { shuffle, startDate })
        : await createLeagueFixtures(t, tournament, teamIds, { doubleRound, startDate, roundIntervalDays });

    await t.query("UPDATE tournaments SET fixtures_generated = TRUE, status = 'ongoing' WHERE id = $1", [tournament.id]);
    return created;
  });

  res.status(201).json({ success: true, message: `${matches.length} matches created`, data: matches });
});

// Knockout only: builds the next round from the winners of the latest finished round
exports.advance = asyncHandler(async (req, res) => {
  const result = await tx(async (t) => {
    const tournament = await findOwned('tournaments', req.params.id, req.orgId, 'Tournament', t, true);
    if (tournament.format !== 'knockout') throw new ApiError(400, 'Only knockout tournaments can advance rounds');

    const last = (await t.query('SELECT MAX(round)::int AS round FROM matches WHERE tournament_id = $1', [tournament.id])).rows[0].round;
    if (!last) throw new ApiError(400, 'Generate fixtures first');

    const { rows: current } = await t.query(
      'SELECT * FROM matches WHERE tournament_id = $1 AND round = $2 ORDER BY seq', [tournament.id, last]);
    if (current.some((m) => m.status !== 'finished' || !m.winnerId)) {
      throw new ApiError(409, 'All matches in the current round must be finished with a winner');
    }

    if (current.length === 1) {
      await t.query("UPDATE tournaments SET status = 'completed' WHERE id = $1", [tournament.id]);
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
