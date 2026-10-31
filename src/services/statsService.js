const { prisma } = require('../config/db');

exports.getStandings = async (tournamentId) => {
  const [tournament, teams, matches] = await Promise.all([
    prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { pointsWin: true, pointsDraw: true, pointsLoss: true },
    }),
    prisma.team.findMany({
      where: { tournamentId },
      select: { id: true, name: true, shortName: true, logoUrl: true },
    }),
    prisma.match.findMany({
      where: { tournamentId, status: 'finished', isBye: false },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    }),
  ]);
  if (!tournament) return [];

  const standings = new Map(teams.map((team) => [team.id, {
    team,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
  }]));

  for (const match of matches) {
    const home = standings.get(match.homeTeamId);
    const away = standings.get(match.awayTeamId);
    if (!home || !away) continue;

    home.played++;
    away.played++;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) {
      home.won++;
      home.points += tournament.pointsWin;
      away.lost++;
      away.points += tournament.pointsLoss;
    } else if (match.homeScore < match.awayScore) {
      away.won++;
      away.points += tournament.pointsWin;
      home.lost++;
      home.points += tournament.pointsLoss;
    } else {
      home.drawn++;
      away.drawn++;
      home.points += tournament.pointsDraw;
      away.points += tournament.pointsDraw;
    }
  }

  return [...standings.values()]
    .map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort((a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.team.name.localeCompare(b.team.name)
    )
    .map((row, index) => ({
      position: index + 1,
      team: row.team,
      played: row.played,
      won: row.won,
      drawn: row.drawn,
      lost: row.lost,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      goalDifference: row.goalDifference,
      points: row.points,
    }));
};

exports.getTopScorers = async (tournamentId, limit = 10) => {
  const matches = await prisma.match.findMany({
    where: { tournamentId },
    select: { id: true },
  });
  if (!matches.length) return [];

  const grouped = await prisma.matchEvent.groupBy({
    by: ['playerId', 'teamId'],
    where: { type: 'goal', matchId: { in: matches.map(({ id }) => id) }, playerId: { not: null } },
    _count: { _all: true },
  });
  const playerIds = [...new Set(grouped.map(({ playerId }) => playerId).filter(Boolean))];
  const teamIds = [...new Set(grouped.map(({ teamId }) => teamId))];
  const [players, teams] = await Promise.all([
    prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, name: true, jerseyNumber: true },
    }),
    prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, name: true, shortName: true },
    }),
  ]);
  const playersById = new Map(players.map((player) => [player.id, player]));
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  return grouped
    .map(({ playerId, teamId, _count }) => ({
      player: playersById.get(playerId),
      team: teamsById.get(teamId),
      goals: _count._all,
    }))
    .filter((scorer) => scorer.player && scorer.team)
    .sort((a, b) => b.goals - a.goals || a.player.name.localeCompare(b.player.name))
    .slice(0, limit);
};
