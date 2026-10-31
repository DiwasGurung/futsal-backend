const { roundRobin, knockoutPairs, roundLabel } = require('../utils/fixtures');

const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

// Bulk insert (chunked to stay under PostgreSQL's 65,535 bind-parameter limit)
async function insertMatches(runner, docs) {
  const cols = ['organization_id', 'tournament_id', 'round', 'round_name', 'home_team_id',
                'away_team_id', 'scheduled_at', 'status', 'winner_id', 'is_bye'];
  const out = [];
  for (let i = 0; i < docs.length; i += 500) {
    const chunk = docs.slice(i, i + 500);
    const values = [];
    const tuples = chunk.map((d, idx) => {
      values.push(d.organizationId, d.tournamentId, d.round, d.roundName, d.homeTeamId,
                  d.awayTeamId ?? null, d.scheduledAt ?? null, d.status ?? 'scheduled',
                  d.winnerId ?? null, d.isBye ?? false);
      const base = idx * cols.length;
      return `(${cols.map((_, j) => `$${base + j + 1}`).join(',')})`;
    });
    const { rows } = await runner.query(
      `INSERT INTO matches (${cols.join(',')}) VALUES ${tuples.join(',')} RETURNING *`,
      values
    );
    out.push(...rows);
  }
  return out;
}
exports.insertMatches = insertMatches;

exports.createLeagueFixtures = (runner, tournament, teamIds, { doubleRound = false, startDate, roundIntervalDays = 7 } = {}) => {
  const schedule = roundRobin(teamIds, doubleRound);
  const docs = [];
  schedule.forEach((pairs, i) => {
    pairs.forEach(([home, away]) => {
      docs.push({
        organizationId: tournament.organizationId,
        tournamentId: tournament.id,
        round: i + 1,
        roundName: `Matchday ${i + 1}`,
        homeTeamId: home,
        awayTeamId: away,
        scheduledAt: startDate ? addDays(startDate, i * roundIntervalDays) : null,
      });
    });
  });
  return insertMatches(runner, docs);
};

// One knockout round. Bye matches are auto-finished with the advancing team as winner.
exports.createKnockoutRound = (runner, tournament, teamIds, roundNumber, { shuffle = false, startDate } = {}) => {
  const pairs = knockoutPairs(teamIds, shuffle);
  const label = roundLabel(pairs.length * 2);
  const docs = pairs.map(([home, away]) => ({
    organizationId: tournament.organizationId,
    tournamentId: tournament.id,
    round: roundNumber,
    roundName: label,
    homeTeamId: home,
    awayTeamId: away || null,
    isBye: !away,
    status: away ? 'scheduled' : 'finished',
    winnerId: away ? null : home,
    scheduledAt: startDate ?? null,
  }));
  return insertMatches(runner, docs);
};
