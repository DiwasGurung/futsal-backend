// Usage: npm run seed  -> demo organization with a league, teams, players and two played matchdays
const bcrypt = require('bcryptjs');
const { tx, prisma } = require('../config/db');
const { createLeagueFixtures } = require('../services/fixtureService');

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[rnd(0, arr.length - 1)];

const TEAMS = ['Thunder FC', 'Kings United', 'Himalayan Hawks', 'Lake City Panthers', 'Valley Strikers', 'Red Rhinos'];
const FIRST = ['Aarav', 'Bikash', 'Sujan', 'Rohan', 'Anil', 'Prabin', 'Nabin', 'Kiran', 'Sagar', 'Dipesh', 'Manish', 'Rajan'];
const LAST = ['Sharma', 'Thapa', 'Gurung', 'Rai', 'Karki', 'Shrestha', 'Adhikari', 'Magar', 'Tamang', 'Basnet'];
const POSITIONS = ['goalkeeper', 'fixo', 'ala', 'ala', 'pivot', 'pivot'];

(async () => {
  await prisma.organization.deleteMany({ where: { slug: 'demo-futsal' } });

  await tx(async (t) => {
    const org = await t.organization.create({
      data: { name: 'Demo Futsal League', slug: 'demo-futsal', plan: 'pro' },
    });
    const hash = await bcrypt.hash('password123', 12);
    await t.user.createMany({
      data: [
        { organizationId: org.id, name: 'Demo Owner', email: 'owner@demo.com', passwordHash: hash, role: 'owner' },
        { organizationId: org.id, name: 'Demo Scorer', email: 'scorer@demo.com', passwordHash: hash, role: 'scorekeeper' },
      ],
    });

    const tournament = await t.tournament.create({
      data: {
        organizationId: org.id, name: 'Spring Futsal Cup', slug: 'spring-futsal-cup',
        format: 'league', status: 'ongoing', venue: 'City Indoor Arena', startDate: new Date(), fixturesGenerated: true,
      },
    });

    const playersByTeam = {};
    const teamIds = [];
    for (const name of TEAMS) {
      const team = await t.team.create({
        data: {
          organizationId: org.id, tournamentId: tournament.id, name,
          shortName: name.split(' ').map((w) => w[0]).join('').slice(0, 3),
        },
      });
      teamIds.push(team.id);
      playersByTeam[team.id] = [];
      const players = await t.player.createManyAndReturn({
        data: Array.from({ length: 8 }, (_, i) => ({
          organizationId: org.id, teamId: team.id, name: `${pick(FIRST)} ${pick(LAST)}`,
          jerseyNumber: i + 1, position: POSITIONS[i % POSITIONS.length],
        })),
        select: { id: true },
      });
      playersByTeam[team.id].push(...players.map((player) => player.id));
    }

    const matches = await createLeagueFixtures(t, tournament, teamIds, { startDate: new Date(), roundIntervalDays: 7 });

    // play the first two matchdays with random results
    for (const m of matches.filter((x) => x.round <= 2)) {
      const hs = rnd(0, 6);
      const as = rnd(0, 6);
      const events = [];
      const goals = (teamId, n) => {
        for (let i = 0; i < n; i++) {
          events.push({
            matchId: m.id,
            type: 'goal',
            teamId,
            playerId: pick(playersByTeam[teamId]),
            minute: rnd(1, 40),
          });
        }
      };
      goals(m.homeTeamId, hs);
      goals(m.awayTeamId, as);
      if (events.length) await t.matchEvent.createMany({ data: events });
      const winner = hs > as ? m.homeTeamId : as > hs ? m.awayTeamId : null;
      await t.match.update({
        where: { id: m.id },
        data: { status: 'finished', homeScore: hs, awayScore: as, winnerId: winner },
      });
    }
  });

  console.log('Seed complete.');
  console.log('  Owner:       owner@demo.com / password123');
  console.log('  Scorekeeper: scorer@demo.com / password123');
  console.log('  Public:      GET /api/public/demo-futsal/tournaments/spring-futsal-cup/standings');
  await prisma.$disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
