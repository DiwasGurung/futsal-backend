const Organization = require('../models/Organization');
const Tournament = require('../models/Tournament');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Match = require('../models/Match');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { getPagination, matchFilter } = require('../utils/query');
const { getStandings, getTopScorers } = require('../services/statsService');

// No-auth read-only endpoints for the fan-facing Flutter app / public tournament pages
const loadOrg = async (slug) => {
  const org = await Organization.findOne({ slug: String(slug).toLowerCase(), isActive: true });
  if (!org) throw new ApiError(404, 'Organization not found');
  return org;
};

const loadTournament = async (orgSlug, slug) => {
  const org = await loadOrg(orgSlug);
  const t = await Tournament.findOne({ organization: org._id, slug: String(slug).toLowerCase(), status: { $ne: 'draft' } });
  if (!t) throw new ApiError(404, 'Tournament not found');
  return { org, t };
};

exports.organization = asyncHandler(async (req, res) => {
  const org = await loadOrg(req.params.orgSlug);
  res.json({ success: true, data: { name: org.name, slug: org.slug, logoUrl: org.logoUrl } });
});

exports.tournaments = asyncHandler(async (req, res) => {
  const org = await loadOrg(req.params.orgSlug);
  const data = await Tournament.find({ organization: org._id, status: { $ne: 'draft' } })
    .select('name slug format status startDate endDate venue')
    .sort('-startDate');
  res.json({ success: true, data });
});

exports.tournament = asyncHandler(async (req, res) => {
  const { t } = await loadTournament(req.params.orgSlug, req.params.slug);
  res.json({ success: true, data: t });
});

exports.teams = asyncHandler(async (req, res) => {
  const { t } = await loadTournament(req.params.orgSlug, req.params.slug);
  res.json({ success: true, data: await Team.find({ tournament: t._id }).select('name shortName logoUrl').sort('name') });
});

exports.team = asyncHandler(async (req, res) => {
  const { t } = await loadTournament(req.params.orgSlug, req.params.slug);
  const team = await Team.findOne({ _id: req.params.teamId, tournament: t._id }).select('name shortName logoUrl');
  if (!team) throw new ApiError(404, 'Team not found');
  const players = await Player.find({ team: team._id, isActive: true }).select('name jerseyNumber position').sort('jerseyNumber');
  res.json({ success: true, data: team, players });
});

exports.standings = asyncHandler(async (req, res) => {
  const { t } = await loadTournament(req.params.orgSlug, req.params.slug);
  if (t.format !== 'league') throw new ApiError(400, 'Standings are only available for league tournaments');
  res.json({ success: true, data: await getStandings(t) });
});

exports.matches = asyncHandler(async (req, res) => {
  const { org, t } = await loadTournament(req.params.orgSlug, req.params.slug);
  const filter = { ...matchFilter(req.query), organization: org._id, tournament: t._id };
  const { page, limit, skip } = getPagination(req.query);
  const [data, total] = await Promise.all([
    Match.find(filter)
      .select('-events')
      .populate('homeTeam awayTeam', 'name shortName logoUrl')
      .sort({ round: 1, scheduledAt: 1, _id: 1 })
      .skip(skip)
      .limit(limit),
    Match.countDocuments(filter),
  ]);
  res.json({ success: true, data, meta: { page, limit, total } });
});

// Poll this (or add websockets later) for live score screens
exports.match = asyncHandler(async (req, res) => {
  const { org, t } = await loadTournament(req.params.orgSlug, req.params.slug);
  const match = await Match.findOne({ _id: req.params.matchId, organization: org._id, tournament: t._id })
    .populate('homeTeam awayTeam', 'name shortName logoUrl')
    .populate('events.player', 'name jerseyNumber');
  if (!match) throw new ApiError(404, 'Match not found');
  res.json({ success: true, data: match });
});

exports.topScorers = asyncHandler(async (req, res) => {
  const { t } = await loadTournament(req.params.orgSlug, req.params.slug);
  res.json({ success: true, data: await getTopScorers(t._id, Math.min(parseInt(req.query.limit, 10) || 10, 50)) });
});
