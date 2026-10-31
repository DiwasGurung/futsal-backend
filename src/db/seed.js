// Usage: npm run seed  -> demo organization with a league, teams, players and two played matchdays
const bcrypt = require('bcryptjs');
const { db, tx, pool } = require('../config/db');
const { insertRow } = require('../utils/sql');
const { createLeagueFixtures } = require('../services/fixtureService');

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[rnd(0, arr.length - 1)];

const TEAMS = ['Thunder FC', 'Kings United', 'Himalayan Hawks', 'Lake City Panthers', 'Valley Strikers', 'Red Rhinos'];
const FIRST = ['Aarav', 'Bikash', 'Sujan', 'Rohan', 'Anil', 'Prabin', 'Nabin', 'Kiran', 'Sagar', 'Dipesh', 'Manish', 'Rajan'];
const LAST = ['Sharma', 'Thapa', 'Gurung', 'Rai', 'Karki', 'Shrestha', 'Adhikari', 'Magar', 'Tamang', 'Basnet'];
const POSITIONS = ['goalkeeper', 'fixo', 'ala', 'ala', 'pivot', 'pivot'];

(async () => {
  await db.query("DELETE FROM organizations WHERE slug = 'demo-futsal'"); // cascades everything

  await tx(async (t) => {
    const org = await insertRow(t, 'organizations', { name: 'Demo Futsal League', slug: 'demo-futsal', plan: 'pro' });
    const hash = await bcrypt.hash('password123', 12);
    await insertRow(t, 'users', { organizationId: org.id, name: 'Demo Owner', email: 'owner@demo.com', passwordHash: hash, role: 'owner' });
    await insertRow(t, 'users', { organizationId: org.id, name: 'Demo Scorer', email: 'scorer@demo.com', passwordHash: hash, role: 'scorekeeper' });

    const tournament = await insertRow(t, 'tournaments', {
      organizationId: org.id, name: 'Spring Futsal Cup', slug: 'spring-futsal-cup',
      format: 'league', status: 'ongoing', venue: 'City Indoor Arena', startDate: new Date(), fixturesGenerated: true,
    });

    const playersByTeam = {};
    const teamIds = [];
    for (const name of TEAMS) {
      const team = await insertRow(t, 'teams', {
        organizationId: org.id, tournamentId: tournament.id, name,
        shortName: name.split(' ').map((w) => w[0]).join('').slice(0, 3),
      });
      teamIds.push(team.id);
      playersByTeam[team.id] = [];
      for (let i = 0; i < 8; i++) {
        const p = await insertRow(t, 'players', {
          organizationId: org.id, teamId: team.id, name: `${pick(FIRST)} ${pick(LAST)}`,
          jerseyNumber: i + 1, position: POSITIONS[i % POSITIONS.length],
        });
        playersByTeam[team.id].push(p.id);
      }
    }

    const matches = await createLeagueFixtures(t, tournament, teamIds, { startDate: new Date(), roundIntervalDays: 7 });

    // play the first two matchdays with random results
    for (const m of matches.filter((x) => x.round <= 2)) {
      const hs = rnd(0, 6);
      const as = rnd(0, 6);
      const goals = async (teamId, n) => {
        for (let i = 0; i < n; i++) {
          await t.query(
            "INSERT INTO match_events (match_id, type, team_id, player_id, minute) VALUES ($1,'goal',$2,$3,$4)",
            [m.id, teamId, pick(playersByTeam[teamId]), rnd(1, 40)]
          );
        }
      };
      await goals(m.homeTeamId, hs);
      await goals(m.awayTeamId, as);
      const winner = hs > as ? m.homeTeamId : as > hs ? m.awayTeamId : null;
      await t.query(
        "UPDATE matches SET status = 'finished', home_score = $1, away_score = $2, winner_id = $3 WHERE id = $4",
        [hs, as, winner, m.id]
      );
    }
  });

  console.log('Seed complete.');
  console.log('  Owner:       owner@demo.com / password123');
  console.log('  Scorekeeper: scorer@demo.com / password123');
  console.log('  Public:      GET /api/public/demo-futsal/tournaments/spring-futsal-cup/standings');
  await pool.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
