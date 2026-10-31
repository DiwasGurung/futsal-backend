const { db } = require('../config/db');

// Uses the tournament_standings view (defined in schema.sql)
exports.getStandings = async (tournamentId) => {
  const { rows } = await db.query(
    'SELECT * FROM tournament_standings WHERE tournament_id = $1 ORDER BY position',
    [tournamentId]
  );
  return rows.map((r) => ({
    position: r.position,
    team: { id: r.teamId, name: r.name, shortName: r.shortName, logoUrl: r.logoUrl },
    played: r.played, won: r.won, drawn: r.drawn, lost: r.lost,
    goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, goalDifference: r.goalDifference,
    points: r.points,
  }));
};

exports.getTopScorers = async (tournamentId, limit = 10) => {
  const { rows } = await db.query(
    `SELECT p.id AS player_id, p.name AS player_name, p.jersey_number,
            t.id AS team_id, t.name AS team_name, t.short_name,
            COUNT(*)::int AS goals
       FROM match_events e
       JOIN matches m ON m.id = e.match_id
       JOIN players p ON p.id = e.player_id
       JOIN teams t   ON t.id = e.team_id
      WHERE m.tournament_id = $1 AND e.type = 'goal'
      GROUP BY p.id, t.id
      ORDER BY goals DESC, p.name
      LIMIT $2`,
    [tournamentId, limit]
  );
  return rows.map((r) => ({
    goals: r.goals,
    player: { id: r.playerId, name: r.playerName, jerseyNumber: r.jerseyNumber },
    team: { id: r.teamId, name: r.teamName, shortName: r.shortName },
  }));
};
