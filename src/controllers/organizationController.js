const plans = require('../config/plans');
const { prisma } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const dto = require('../utils/dto');

const finite = (n) => (Number.isFinite(n) ? n : null); // null = unlimited

// Org profile + plan limits + current usage (for a billing/usage screen)
exports.get = asyncHandler(async (req, res) => {
  const [tournaments, staff, teams] = await Promise.all([
    prisma.tournament.count({ where: { organizationId: req.orgId } }),
    prisma.user.count({ where: { organizationId: req.orgId } }),
    prisma.team.count({ where: { organizationId: req.orgId } }),
  ]);
  const limits = plans[req.org.plan] || plans.free;
  res.json({
    success: true,
    data: req.org,
    limits: {
      maxTournaments: finite(limits.maxTournaments),
      maxTeamsPerTournament: finite(limits.maxTeamsPerTournament),
      maxStaff: finite(limits.maxStaff),
    },
    usage: { tournaments, staff, teams },
  });
});

exports.update = asyncHandler(async (req, res) => {
  // slug and plan are never client-editable
  const org = await prisma.organization.update({ where: { id: req.orgId }, data: req.body });
  res.json({ success: true, data: dto.org(org) });
});
