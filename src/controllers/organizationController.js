const plans = require('../config/plans');
const { db } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { updateRow } = require('../utils/sql');
const dto = require('../utils/dto');

const finite = (n) => (Number.isFinite(n) ? n : null); // null = unlimited

// Org profile + plan limits + current usage (for a billing/usage screen)
exports.get = asyncHandler(async (req, res) => {
  const { rows } = await db.query(
    `SELECT (SELECT COUNT(*)::int FROM tournaments WHERE organization_id = $1) AS tournaments,
            (SELECT COUNT(*)::int FROM users       WHERE organization_id = $1) AS staff,
            (SELECT COUNT(*)::int FROM teams       WHERE organization_id = $1) AS teams`,
    [req.orgId]
  );
  const limits = plans[req.org.plan] || plans.free;
  res.json({
    success: true,
    data: req.org,
    limits: {
      maxTournaments: finite(limits.maxTournaments),
      maxTeamsPerTournament: finite(limits.maxTeamsPerTournament),
      maxStaff: finite(limits.maxStaff),
    },
    usage: rows[0],
  });
});

exports.update = asyncHandler(async (req, res) => {
  // slug and plan are never client-editable
  const org = await updateRow(db, 'organizations', req.orgId, req.body);
  res.json({ success: true, data: dto.org(org) });
});
