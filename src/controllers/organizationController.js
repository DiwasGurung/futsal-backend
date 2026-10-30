const plans = require('../config/plans');
const Tournament = require('../models/Tournament');
const User = require('../models/User');
const Team = require('../models/Team');
const asyncHandler = require('../utils/asyncHandler');

// Returns org profile + plan limits + current usage (for a billing/usage screen)
exports.get = asyncHandler(async (req, res) => {
  const [tournaments, staff, teams] = await Promise.all([
    Tournament.countDocuments({ organization: req.orgId }),
    User.countDocuments({ organization: req.orgId }),
    Team.countDocuments({ organization: req.orgId }),
  ]);
  const limits = plans[req.org.plan] || plans.free;
  res.json({
    success: true,
    data: req.org,
    limits: {
      maxTournaments: Number.isFinite(limits.maxTournaments) ? limits.maxTournaments : null,
      maxTeamsPerTournament: Number.isFinite(limits.maxTeamsPerTournament) ? limits.maxTeamsPerTournament : null,
      maxStaff: Number.isFinite(limits.maxStaff) ? limits.maxStaff : null,
    },
    usage: { tournaments, staff, teams },
  });
});

exports.update = asyncHandler(async (req, res) => {
  Object.assign(req.org, req.body); // slug and plan are never client-editable
  await req.org.save();
  res.json({ success: true, data: req.org });
});
