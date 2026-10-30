// Usage: npm run seed   -> creates a demo organization with a league, teams, players and some results
const mongoose = require('mongoose');
const env = require('../config/env');
const connectDB = require('../config/db');
const Organization = require('../models/Organization');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const Team = require('../models/Team');
const Player = require('../models/Player');
const Match = require('../models/Match');
const { createLeagueFixtures } = require('../services/fixtureService');

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = (arr) => arr[rnd(0, arr.length - 1)];

const TEAMS = ['Thunder FC', 'Kings United', 'Himalayan Hawks', 'Lake City Panthers', 'Valley Strikers', 'Red Rhinos'];
const FIRST = ['Aarav', 'Bikash', 'Sujan', 'Rohan', 'Anil', 'Prabin', 'Nabin', 'Kiran', 'Sagar', 'Dipesh', 'Manish', 'Rajan'];
const LAST = ['Sharma', 'Thapa', 'Gurung', 'Rai', 'Karki', 'Shrestha', 'Adhikari', 'Magar', 'Tamang', 'Basnet'];
const POSITIONS = ['goalkeeper', 'fixo', 'ala', 'ala', 'pivot', 'pivot'];

(async () => {
  await connectDB();

  const existing = await Organization.findOne({ slug: 'demo-futsal' });
  if (existing) {
    const o = existing._id;
    await Promise.all([User, Tournament, Team, Player, Match].map((M) => M.deleteMany({ organization: o })));
    await existing.deleteOne();
  }

  const org = await Organization.create({ name: 'Demo Futsal League', slug: 'demo-futsal', plan: 'pro' });
  await User.create([
    { organization: org._id, name: 'Demo Owner', email: 'owner@demo.com', password: 'password123', role: 'owner' },
    { organization: org._id, name: 'Demo Scorer', email: 'scorer@demo.com', password: 'password123', role: 'scorekeeper' },
  ]);

  const tournament = await Tournament.create({
    organization: org._id,
    name: 'Spring Futsal Cup',
    slug: 'spring-futsal-cup',
    format: 'league',
    status: 'ongoing',
    venue: 'City Indoor Arena',
    startDate: new Date(),
  });

  const playersByTeam = {};
  const teams = [];
  for (const name of TEAMS) {
    const team = await Team.create({
      organization: org._id,
      tournament: tournament._id,
      name,
      shortName: name.split(' ').map((w) => w[0]).join('').slice(0, 3),
    });
    teams.push(team);
    const players = await Player.insertMany(
      Array.from({ length: 8 }, (_, i) => ({
        organization: org._id,
        team: team._id,
        name: `${pick(FIRST)} ${pick(LAST)}`,
        jerseyNumber: i + 1,
        position: POSITIONS[i % POSITIONS.length],
      }))
    );
    playersByTeam[team._id] = players;
  }

  const matches = await createLeagueFixtures(tournament, teams, { startDate: new Date(), roundIntervalDays: 7 });
  tournament.fixturesGenerated = true;
  await tournament.save();

  // Play the first two matchdays with random results
  for (const m of matches.filter((x) => x.round <= 2)) {
    const hs = rnd(0, 6);
    const as = rnd(0, 6);
    const events = [];
    const goals = (team, n) => {
      for (let i = 0; i < n; i++) {
        events.push({ type: 'goal', team, player: pick(playersByTeam[team])._id, minute: rnd(1, 40) });
      }
    };
    goals(m.homeTeam, hs);
    goals(m.awayTeam, as);
    events.sort((a, b) => a.minute - b.minute);

    m.events = events;
    m.homeScore = hs;
    m.awayScore = as;
    m.status = 'finished';
    m.winner = hs > as ? m.homeTeam : as > hs ? m.awayTeam : undefined;
    await m.save();
  }

  console.log('Seed complete.');
  console.log('  Owner:      owner@demo.com / password123');
  console.log('  Scorekeeper: scorer@demo.com / password123');
  console.log('  Public URL: GET /api/public/demo-futsal/tournaments/spring-futsal-cup/standings');
  await mongoose.connection.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
