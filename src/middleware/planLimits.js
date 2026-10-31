const plans = require('../config/plans');
const { prisma } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const limitFor = (org) => plans[org.plan] || plans.free;
exports.limitFor = limitFor;

exports.checkTournamentLimit = asyncHandler(async (req, res, next) => {
  const { maxTournaments } = limitFor(req.org);
  const count = await prisma.tournament.count({ where: { organizationId: req.orgId } });
  if (count >= maxTournaments) {
    throw new ApiError(403, `Your ${req.org.plan} plan allows ${maxTournaments} tournament(s). Upgrade to add more.`);
  }
  next();
});

exports.checkStaffLimit = asyncHandler(async (req, res, next) => {
  const { maxStaff } = limitFor(req.org);
  const count = await prisma.user.count({ where: { organizationId: req.orgId } });
  if (count >= maxStaff) {
    throw new ApiError(403, `Your ${req.org.plan} plan allows ${maxStaff} staff account(s). Upgrade to add more.`);
  }
  next();
});
