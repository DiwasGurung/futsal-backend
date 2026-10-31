const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { db } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { isUuid } = require('../utils/query');

// Sets req.user, req.org and req.orgId (tenant scope for every query)
exports.protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) throw new ApiError(401, 'Authentication required');

  let decoded;
  try {
    decoded = jwt.verify(header.slice(7), env.jwtSecret);
  } catch {
    throw new ApiError(401, 'Invalid or expired token');
  }
  if (!isUuid(decoded.id)) throw new ApiError(401, 'Invalid token');

  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email, u.role, u.is_active,
            o.id AS org_id, o.name AS org_name, o.slug AS org_slug, o.plan AS org_plan,
            o.logo_url AS org_logo_url, o.contact_email AS org_contact_email, o.is_active AS org_is_active
       FROM users u JOIN organizations o ON o.id = u.organization_id
      WHERE u.id = $1`,
    [decoded.id]
  );
  const r = rows[0];
  if (!r || !r.isActive || !r.orgIsActive) throw new ApiError(401, 'Account is disabled or no longer exists');

  req.user = { id: r.id, name: r.name, email: r.email, role: r.role };
  req.org = {
    id: r.orgId, name: r.orgName, slug: r.orgSlug, plan: r.orgPlan,
    logoUrl: r.orgLogoUrl, contactEmail: r.orgContactEmail, isActive: r.orgIsActive,
  };
  req.orgId = r.orgId;
  next();
});

exports.authorize = (...roles) => (req, res, next) =>
  roles.includes(req.user.role)
    ? next()
    : next(new ApiError(403, 'You do not have permission to perform this action'));
