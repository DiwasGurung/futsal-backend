const mongoose = require('mongoose');
const Team = require('../models/Team');
const Match = require('../models/Match');
const Player = require('../models/Player');
const { computeStandings } = require('../utils/standings');

exports.getStandings = async (tournament) => {
  const [teams, matches] = await Promise.all([
    Team.find({ tournament: tournament._id }).select('name shortName logoUrl').lean(),
    Match.find({ tournament: tournament._id, status: 'finished', isBye: { $ne: true } })
      .select('homeTeam awayTeam homeScore awayScore status isBye')
      .lean(),
  ]);
  return computeStandings(teams, matches, tournament.rules);
};

exports.getTopScorers = async (tournamentId, limit = 10) =>
  Match.aggregate([
    { $match: { tournament: new mongoose.Types.ObjectId(String(tournamentId)) } },
    { $unwind: '$events' },
    { $match: { 'events.type': 'goal', 'events.player': { $ne: null } } },
    { $group: { _id: '$events.player', team: { $first: '$events.team' }, goals: { $sum: 1 } } },
    { $sort: { goals: -1 } },
    { $limit: limit },
    { $lookup: { from: Player.collection.name, localField: '_id', foreignField: '_id', as: 'player' } },
    { $unwind: '$player' },
    { $lookup: { from: Team.collection.name, localField: 'team', foreignField: '_id', as: 'team' } },
    { $unwind: '$team' },
    {
      $project: {
        _id: 0,
        goals: 1,
        player: { id: '$player._id', name: '$player.name', jerseyNumber: '$player.jerseyNumber' },
        team: { id: '$team._id', name: '$team.name', shortName: '$team.shortName' },
      },
    },
  ]);
