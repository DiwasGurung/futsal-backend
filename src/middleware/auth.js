const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { prisma } = require('../config/db');
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

  const r = await prisma.user.findUnique({
    where: { id: decoded.id },
    select: {
      id: true, name: true, email: true, role: true, isActive: true,
      organization: {
        select: {
          id: true, name: true, slug: true, plan: true, logoUrl: true, contactEmail: true, isActive: true,
        },
      },
    },
  });
  if (!r || !r.isActive || !r.organization.isActive) {
    throw new ApiError(401, 'Account is disabled or no longer exists');
  }

  req.user = { id: r.id, name: r.name, email: r.email, role: r.role };
  req.org = {
    ...r.organization,
  };
  req.orgId = r.organization.id;
  next();
});

exports.authorize = (...roles) => (req, res, next) =>
  roles.includes(req.user.role)
    ? next()
    : next(new ApiError(403, 'You do not have permission to perform this action'));
