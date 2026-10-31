const { db } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { isUuid, getPagination, applyMatchFilters } = require('../utils/query');
const { Where } = require('../utils/sql');
const dto = require('../utils/dto');
const { getStandings, getTopScorers } = require('../services/statsService');
const { listMatches, getMatchDetail } = require('../services/matchQueries');

// No-auth read-only endpoints for the fan-facing Flutter app / public tournament pages
const loadOrg = async (slug) => {
  const { rows } = await db.query('SELECT * FROM organizations WHERE slug = $1 AND is_active', [String(slug).toLowerCase()]);
  if (!rows[0]) throw new ApiError(404, 'Organization not found');
  return rows[0];
};

const loadTournament = async (orgSlug, slug) => {
  const org = await loadOrg(orgSlug);
  const { rows } = await db.query(
    "SELECT * FROM tournaments WHERE organization_id = $1 AND slug = $2 AND status <> 'draft'",
    [org.id, String(slug).toLowerCase()]
  );
  if (!rows[0]) throw new ApiError(404, 'Tournament not found');
  return { org, t: rows[0] };
};

exports.organization = asyncHandler(async (req, res) => {
  const org = await loadOrg(req.params.orgSlug);
  res.json({ success: true, data: { name: org.name, slug: org.slug, logoUrl: org.logoUrl } });
});

exports.tournaments = asyncHandler(async (req, res) => {
  const org = await loadOrg(req.params.orgSlug);
  const { rows } = await db.query(
    `SELECT name, slug, format, status, start_date, end_date, venue FROM tournaments
      WHERE organization_id = $1 AND status <> 'draft' ORDER BY start_date DESC NULLS LAST, created_at DESC`,
    [org.id]
  );
  res.json({ success: true, data: rows });
});

exports.tournament = asyncHandler(async (req, res) => {
  const { t } = await loadTournament(req.params.orgSlug, req.params.slug);
  const { organizationId, ...pub } = dto.tournament(t);
  res.json({ success: true, data: pub });
});

exports.teams = asyncHandler(async (req, res) => {
  const { t } = await loadTournament(req.params.orgSlug, req.params.slug);
  const { rows } = await db.query('SELECT id, name, short_name, logo_url FROM teams WHERE tournament_id = $1 ORDER BY name', [t.id]);
  res.json({ success: true, data: rows });
});

exports.team = asyncHandler(async (req, res) => {
  const { t } = await loadTournament(req.params.orgSlug, req.params.slug);
  if (!isUuid(req.params.teamId)) throw new ApiError(404, 'Team not found');
  const team = await db.query('SELECT id, name, short_name, logo_url FROM teams WHERE id = $1 AND tournament_id = $2', [req.params.teamId, t.id]);
  if (!team.rows[0]) throw new ApiError(404, 'Team not found');
  const players = await db.query(
    'SELECT id, name, jersey_number, position FROM players WHERE team_id = $1 AND is_active ORDER BY jersey_number', [team.rows[0].id]);
  res.json({ success: true, data: team.rows[0], players: players.rows });
});

exports.standings = asyncHandler(async (req, res) => {
  const { t } = await loadTournament(req.params.orgSlug, req.params.slug);
  if (t.format !== 'league') throw new ApiError(400, 'Standings are only available for league tournaments');
  res.json({ success: true, data: await getStandings(t.id) });
});

exports.matches = asyncHandler(async (req, res) => {
  const { org, t } = await loadTournament(req.params.orgSlug, req.params.slug);
  const where = new Where().add('m.organization_id = $#', org.id).add('m.tournament_id = $#', t.id);
  const q = { ...req.query };
  delete q.tournament; // fixed by the URL
  applyMatchFilters(where, q);
  const { page, limit, skip } = getPagination(req.query);
  const { data, total } = await listMatches(where, { limit, skip });
  res.json({ success: true, data, meta: { page, limit, total } });
});

// Poll this (or add websockets later) for live score screens
exports.match = asyncHandler(async (req, res) => {
  const { org, t } = await loadTournament(req.params.orgSlug, req.params.slug);
  const match = await getMatchDetail(req.params.matchId, org.id, t.id);
  if (!match) throw new ApiError(404, 'Match not found');
  res.json({ success: true, data: match });
});

exports.topScorers = asyncHandler(async (req, res) => {
  const { t } = await loadTournament(req.params.orgSlug, req.params.slug);
  res.json({ success: true, data: await getTopScorers(t.id, Math.min(parseInt(req.query.limit, 10) || 10, 50)) });
});
