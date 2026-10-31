const { prisma } = require('../config/db');
const { isUuid } = require('../utils/query');

const matchSelect = {
  id: true,
  tournamentId: true,
  round: true,
  roundName: true,
  scheduledAt: true,
  court: true,
  status: true,
  homeScore: true,
  awayScore: true,
  penaltyHome: true,
  penaltyAway: true,
  winnerId: true,
  isBye: true,
  homeTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
  awayTeam: { select: { id: true, name: true, shortName: true, logoUrl: true } },
};

const orderBy = [
  { round: 'asc' },
  { scheduledAt: { sort: 'asc', nulls: 'last' } },
  { seq: 'asc' },
];

exports.listMatches = async (where, { limit, skip }) => {
  const [matches, total] = await Promise.all([
    prisma.match.findMany({ where, select: matchSelect, orderBy, take: limit, skip }),
    prisma.match.count({ where }),
  ]);
  return { data: matches, total };
};

exports.getMatchDetail = async (matchId, organizationId, tournamentId = null) => {
  if (!isUuid(matchId)) return null;
  return prisma.match.findFirst({
    where: {
      id: matchId,
      organizationId,
      ...(tournamentId ? { tournamentId } : {}),
    },
    select: {
      ...matchSelect,
      events: {
        orderBy: [{ minute: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          type: true,
          teamId: true,
          minute: true,
          createdAt: true,
          player: { select: { id: true, name: true, jerseyNumber: true } },
        },
      },
    },
  });
};
