// Safe query-string helpers (prevents NoSQL operator injection via ?field[$ne]=x)
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const id = (v) => (typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v) ? v : undefined);

const getPagination = (query, defaultLimit = 50, maxLimit = 200) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  return { page, limit, skip: (page - 1) * limit };
};

const matchFilter = (q) => {
  const f = {};
  const tournament = id(q.tournament);
  if (tournament) f.tournament = tournament;
  const team = id(q.team);
  if (team) f.$or = [{ homeTeam: team }, { awayTeam: team }];
  const status = str(q.status);
  if (status) f.status = status;
  const round = parseInt(q.round, 10);
  if (!Number.isNaN(round)) f.round = round;

  const range = {};
  const from = str(q.from);
  const to = str(q.to);
  if (from && !Number.isNaN(Date.parse(from))) range.$gte = new Date(from);
  if (to && !Number.isNaN(Date.parse(to))) range.$lte = new Date(to);
  if (Object.keys(range).length) f.scheduledAt = range;
  return f;
};

module.exports = { str, id, getPagination, matchFilter };
