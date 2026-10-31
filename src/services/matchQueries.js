const { db } = require('../config/db');
const { isUuid } = require('../utils/query');

const MATCH_COLS = `m.id, m.tournament_id, m.round, m.round_name, m.scheduled_at, m.court, m.status,
  m.home_score, m.away_score, m.penalty_home, m.penalty_away, m.winner_id, m.is_bye,
  json_build_object('id', ht.id, 'name', ht.name, 'shortName', ht.short_name, 'logoUrl', ht.logo_url) AS home_team,
  CASE WHEN awt.id IS NULL THEN NULL
       ELSE json_build_object('id', awt.id, 'name', awt.name, 'shortName', awt.short_name, 'logoUrl', awt.logo_url)
  END AS away_team`;

const MATCH_FROM = `FROM matches m
  JOIN teams ht ON ht.id = m.home_team_id
  LEFT JOIN teams awt ON awt.id = m.away_team_id`;

// where: a Where builder using the "m." alias
exports.listMatches = async (where, { limit, skip }) => {
  const [rows, count] = await Promise.all([
    db.query(
      `SELECT ${MATCH_COLS} ${MATCH_FROM} ${where.sql}
        ORDER BY m.round, m.scheduled_at NULLS LAST, m.seq
        LIMIT ${limit} OFFSET ${skip}`,
      where.params
    ),
    db.query(`SELECT COUNT(*)::int AS total FROM matches m ${where.sql}`, where.params),
  ]);
  return { data: rows.rows, total: count.rows[0].total };
};

// Match with teams + events (each event with its player)
exports.getMatchDetail = async (matchId, orgId, tournamentId = null) => {
  if (!isUuid(matchId)) return null;
  const params = [matchId, orgId];
  let extra = '';
  if (tournamentId) {
    params.push(tournamentId);
    extra = ' AND m.tournament_id = $3';
  }
  const { rows } = await db.query(
    `SELECT ${MATCH_COLS} ${MATCH_FROM} WHERE m.id = $1 AND m.organization_id = $2${extra}`,
    params
  );
  if (!rows[0]) return null;

  const events = await db.query(
    `SELECT e.id, e.type, e.team_id, e.minute, e.created_at,
            CASE WHEN p.id IS NULL THEN NULL
                 ELSE json_build_object('id', p.id, 'name', p.name, 'jerseyNumber', p.jersey_number) END AS player
       FROM match_events e LEFT JOIN players p ON p.id = e.player_id
      WHERE e.match_id = $1
      ORDER BY e.minute, e.created_at`,
    [matchId]
  );
  return { ...rows[0], events: events.rows };
};
