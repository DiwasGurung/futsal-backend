const { prisma } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { isUuid, getPagination, applyMatchFilters } = require('../utils/query');
const dto = require('../utils/dto');
const { getStandings, getTopScorers } = require('../services/statsService');
const { listMatches, getMatchDetail } = require('../services/matchQueries');

// No-auth read-only endpoints for the fan-facing Flutter app / public tournament pages
const loadOrg = async (slug) => {
  const organization = await prisma.organization.findFirst({
    where: { slug: String(slug).toLowerCase(), isActive: true },
  });
  if (!organization) throw new ApiError(404, 'Organization not found');
  return organization;
};

const loadTournament = async (orgSlug, slug) => {
  const org = await loadOrg(orgSlug);
  const tournament = await prisma.tournament.findFirst({
    where: { organizationId: org.id, slug: String(slug).toLowerCase(), status: { not: 'draft' } },
  });
  if (!tournament) throw new ApiError(404, 'Tournament not found');
  return { org, t: tournament };
};

exports.organization = asyncHandler(async (req, res) => {
  const org = await loadOrg(req.params.orgSlug);
  res.json({ success: true, data: { name: org.name, slug: org.slug, logoUrl: org.logoUrl } });
});

exports.tournaments = asyncHandler(async (req, res) => {
  const org = await loadOrg(req.params.orgSlug);
  const tournaments = await prisma.tournament.findMany({
    where: { organizationId: org.id, status: { not: 'draft' } },
    select: { name: true, slug: true, format: true, status: true, startDate: true, endDate: true, venue: true },
    orderBy: [
      { startDate: { sort: 'desc', nulls: 'last' } },
      { createdAt: 'desc' },
    ],
  });
  res.json({ success: true, data: tournaments });
});

exports.tournament = asyncHandler(async (req, res) => {
  const { t } = await loadTournament(req.params.orgSlug, req.params.slug);
  const { organizationId, ...pub } = dto.tournament(t);
  res.json({ success: true, data: pub });
});

exports.teams = asyncHandler(async (req, res) => {
  const { t } = await loadTournament(req.params.orgSlug, req.params.slug);
  const teams = await prisma.team.findMany({
    where: { tournamentId: t.id },
    select: { id: true, name: true, shortName: true, logoUrl: true },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: teams });
});

exports.team = asyncHandler(async (req, res) => {
  const { t } = await loadTournament(req.params.orgSlug, req.params.slug);
  if (!isUuid(req.params.teamId)) throw new ApiError(404, 'Team not found');
  const team = await prisma.team.findFirst({
    where: { id: req.params.teamId, tournamentId: t.id },
    select: { id: true, name: true, shortName: true, logoUrl: true },
  });
  if (!team) throw new ApiError(404, 'Team not found');
  const players = await prisma.player.findMany({
    where: { teamId: team.id, isActive: true },
    select: { id: true, name: true, jerseyNumber: true, position: true },
    orderBy: { jerseyNumber: 'asc' },
  });
  res.json({ success: true, data: team, players });
});

exports.standings = asyncHandler(async (req, res) => {
  const { t } = await loadTournament(req.params.orgSlug, req.params.slug);
  if (t.format !== 'league') throw new ApiError(400, 'Standings are only available for league tournaments');
  res.json({ success: true, data: await getStandings(t.id) });
});

exports.matches = asyncHandler(async (req, res) => {
  const { org, t } = await loadTournament(req.params.orgSlug, req.params.slug);
  const where = { organizationId: org.id, tournamentId: t.id };
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
