// Safe query-string helpers (type-checked, always bound as SQL parameters)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const uuid = (v) => (isUuid(v) ? v : undefined);

const getPagination = (query, defaultLimit = 50, maxLimit = 200) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  return { page, limit, skip: (page - 1) * limit };
};

// Adds match filters (tournament, team, status, round, from, to) to a Where builder
const applyMatchFilters = (where, q) => {
  const tournament = uuid(q.tournament);
  if (tournament) where.add('m.tournament_id = $#', tournament);
  const team = uuid(q.team);
  if (team) where.add('(m.home_team_id = $# OR m.away_team_id = $#)', team);
  const status = str(q.status);
  if (status) where.add('m.status = $#', status);
  const round = parseInt(q.round, 10);
  if (!Number.isNaN(round)) where.add('m.round = $#', round);
  const from = str(q.from);
  if (from && !Number.isNaN(Date.parse(from))) where.add('m.scheduled_at >= $#', new Date(from));
  const to = str(q.to);
  if (to && !Number.isNaN(Date.parse(to))) where.add('m.scheduled_at <= $#', new Date(to));
  return where;
};

module.exports = { isUuid, str, uuid, getPagination, applyMatchFilters };
