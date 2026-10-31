const plans = require('../config/plans');
const { db } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const limitFor = (org) => plans[org.plan] || plans.free;
exports.limitFor = limitFor;

exports.checkTournamentLimit = asyncHandler(async (req, res, next) => {
  const { maxTournaments } = limitFor(req.org);
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM tournaments WHERE organization_id = $1', [req.orgId]);
  if (rows[0].n >= maxTournaments) {
    throw new ApiError(403, `Your ${req.org.plan} plan allows ${maxTournaments} tournament(s). Upgrade to add more.`);
  }
  next();
});

exports.checkStaffLimit = asyncHandler(async (req, res, next) => {
  const { maxStaff } = limitFor(req.org);
  const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM users WHERE organization_id = $1', [req.orgId]);
  if (rows[0].n >= maxStaff) {
    throw new ApiError(403, `Your ${req.org.plan} plan allows ${maxStaff} staff account(s). Upgrade to add more.`);
  }
  next();
});
