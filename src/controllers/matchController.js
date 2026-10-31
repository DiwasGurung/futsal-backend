const { db, tx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const findOwned = require('../utils/findOwned');
const { updateRow, Where } = require('../utils/sql');
const { getPagination, applyMatchFilters } = require('../utils/query');
const { listMatches, getMatchDetail } = require('../services/matchQueries');

// Score is always derived from events in SQL, so it can never drift out of sync
const RECOMPUTE_SCORE = `
  UPDATE matches m SET
    home_score = (SELECT COUNT(*) FROM match_events e WHERE e.match_id = m.id AND
                  ((e.type = 'goal' AND e.team_id = m.home_team_id) OR (e.type = 'own_goal' AND e.team_id = m.away_team_id))),
    away_score = (SELECT COUNT(*) FROM match_events e WHERE e.match_id = m.id AND
                  ((e.type = 'goal' AND e.team_id = m.away_team_id) OR (e.type = 'own_goal' AND e.team_id = m.home_team_id)))
  WHERE m.id = $1
  RETURNING m.home_score, m.away_score`;

exports.list = asyncHandler(async (req, res) => {
  const where = new Where().add('m.organization_id = $#', req.orgId);
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
  res.json({ success: true, data: await updateRow(db, 'matches', match.id, req.body) });
});

exports.start = asyncHandler(async (req, res) => {
  const match = await findOwned('matches', req.params.id, req.orgId, 'Match');
  if (match.isBye) throw new ApiError(400, 'Bye matches cannot be played');
  if (match.status !== 'scheduled') throw new ApiError(409, `Match is already ${match.status}`);
  const { rows } = await db.query("UPDATE matches SET status = 'live' WHERE id = $1 RETURNING *", [match.id]);
  res.json({ success: true, data: rows[0] });
});

exports.addEvent = asyncHandler(async (req, res) => {
  const { type, team, player, minute } = req.body;

  const result = await tx(async (t) => {
    const match = await findOwned('matches', req.params.id, req.orgId, 'Match', t, true); // row lock
    if (match.status !== 'live') throw new ApiError(409, 'Match must be live to record events');
    if (![match.homeTeamId, match.awayTeamId].includes(team)) throw new ApiError(400, 'Team is not part of this match');
    if (type !== 'own_goal' && !player) throw new ApiError(400, 'player is required for this event type');
    if (player) {
      const ok = await t.query('SELECT 1 FROM players WHERE id = $1 AND team_id = $2 AND organization_id = $3', [player, team, req.orgId]);
      if (!ok.rowCount) throw new ApiError(400, 'Player does not belong to that team');
    }
    const ev = await t.query(
      'INSERT INTO match_events (match_id, type, team_id, player_id, minute) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [match.id, type, team, player ?? null, minute]
    );
    const score = await t.query(RECOMPUTE_SCORE, [match.id]);
    return { event: ev.rows[0], homeScore: score.rows[0].homeScore, awayScore: score.rows[0].awayScore };
  });
  res.status(201).json({ success: true, data: result });
});

exports.removeEvent = asyncHandler(async (req, res) => {
  const result = await tx(async (t) => {
    const match = await findOwned('matches', req.params.id, req.orgId, 'Match', t, true);
    if (match.status !== 'live') throw new ApiError(409, 'Match must be live to edit events');
    const del = await t.query('DELETE FROM match_events WHERE id = $1 AND match_id = $2', [req.params.eventId, match.id]);
    if (!del.rowCount) throw new ApiError(404, 'Event not found');
    const score = await t.query(RECOMPUTE_SCORE, [match.id]);
    return { homeScore: score.rows[0].homeScore, awayScore: score.rows[0].awayScore };
  });
  res.json({ success: true, data: result });
});

exports.finish = asyncHandler(async (req, res) => {
  const match = await tx(async (t) => {
    const m = await findOwned('matches', req.params.id, req.orgId, 'Match', t, true);
    if (m.status !== 'live') throw new ApiError(409, 'Only a live match can be finished');
    const { rows } = await t.query('SELECT format FROM tournaments WHERE id = $1', [m.tournamentId]);

    let winnerId = null;
    let penaltyHome = null;
    let penaltyAway = null;
    if (m.homeScore !== m.awayScore) {
      winnerId = m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId;
    } else if (rows[0].format === 'knockout') {
      ({ penaltyHome, penaltyAway } = req.body);
      if (penaltyHome == null || penaltyAway == null || penaltyHome === penaltyAway) {
        throw new ApiError(400, 'Knockout draws need a penalty shootout result with a clear winner (penaltyHome, penaltyAway)');
      }
      winnerId = penaltyHome > penaltyAway ? m.homeTeamId : m.awayTeamId;
    } // league draw: no winner

    const upd = await t.query(
      "UPDATE matches SET status = 'finished', winner_id = $1, penalty_home = $2, penalty_away = $3 WHERE id = $4 RETURNING *",
      [winnerId, penaltyHome, penaltyAway, m.id]
    );
    return upd.rows[0];
  });
  res.json({ success: true, data: match });
});

// Lets admins correct a finished match
exports.reopen = asyncHandler(async (req, res) => {
  const match = await findOwned('matches', req.params.id, req.orgId, 'Match');
  if (match.status !== 'finished' || match.isBye) throw new ApiError(409, 'Only finished matches can be reopened');
  const later = await db.query('SELECT 1 FROM matches WHERE tournament_id = $1 AND round > $2 LIMIT 1', [match.tournamentId, match.round]);
  if (later.rowCount) throw new ApiError(409, 'Cannot reopen: a later round has already been generated');

  const { rows } = await db.query(
    "UPDATE matches SET status = 'live', winner_id = NULL, penalty_home = NULL, penalty_away = NULL WHERE id = $1 RETURNING *",
    [match.id]
  );
  res.json({ success: true, data: rows[0] });
});
