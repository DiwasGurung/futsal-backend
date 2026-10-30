const Match = require('../models/Match');
const { roundRobin, knockoutPairs, roundLabel } = require('../utils/fixtures');

const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};

exports.createLeagueFixtures = async (tournament, teams, { doubleRound = false, startDate, roundIntervalDays = 7 } = {}) => {
  const schedule = roundRobin(teams.map((t) => t._id), doubleRound);
  const docs = [];
  schedule.forEach((pairs, i) => {
    pairs.forEach(([home, away]) => {
      docs.push({
        organization: tournament.organization,
        tournament: tournament._id,
        round: i + 1,
        roundName: `Matchday ${i + 1}`,
        homeTeam: home,
        awayTeam: away,
        scheduledAt: startDate ? addDays(startDate, i * roundIntervalDays) : undefined,
      });
    });
  });
  return Match.insertMany(docs);
};

// Creates one knockout round. Bye matches are auto-finished with the advancing team as winner.
exports.createKnockoutRound = async (tournament, teamIds, roundNumber, { shuffle = false, startDate } = {}) => {
  const pairs = knockoutPairs(teamIds, shuffle);
  const label = roundLabel(pairs.length * 2);
  const docs = pairs.map(([home, away]) => ({
    organization: tournament.organization,
    tournament: tournament._id,
    round: roundNumber,
    roundName: label,
    homeTeam: home,
    awayTeam: away || undefined,
    isBye: !away,
    status: away ? 'scheduled' : 'finished',
    winner: away ? undefined : home,
    scheduledAt: startDate,
  }));
  return Match.insertMany(docs);
};
