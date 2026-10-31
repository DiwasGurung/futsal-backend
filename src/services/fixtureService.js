const { roundRobin, knockoutPairs, roundLabel } = require('../utils/fixtures');

const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

async function insertMatches(runner, docs) {
  if (!docs.length) return [];
  const matches = await runner.match.createManyAndReturn({ data: docs });
  return matches.map((match) => ({ ...match, seq: match.seq.toString() }));
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
