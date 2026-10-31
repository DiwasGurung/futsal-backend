const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { prisma, tx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { uniqueSlug } = require('../utils/slugify');
const dto = require('../utils/dto');

const signToken = (user) =>
  jwt.sign({ id: user.id, org: user.organizationId, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

// SaaS sign-up: creates a new organization (tenant) and its owner account atomically
exports.register = asyncHandler(async (req, res) => {
  const { organizationName, name, email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, 12);

  const { org, user } = await tx(async (t) => {
    const taken = await t.user.findUnique({ where: { email }, select: { id: true } });
    if (taken) throw new ApiError(409, 'Email already registered');

    const slug = await uniqueSlug('organizations', organizationName, null, t);
    const org = await t.organization.create({ data: { name: organizationName, slug, contactEmail: email } });
    const user = await t.user.create({
      data: { organizationId: org.id, name, email, passwordHash, role: 'owner' },
    });
    return { org, user };
  });

  res.status(201).json({ success: true, token: signToken(user), user: dto.user(user), organization: dto.org(org) });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email }, include: { organization: true } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  const org = user.organization;
  if (!user.isActive || !org?.isActive) throw new ApiError(403, 'Account is disabled');

  res.json({ success: true, token: signToken(user), user: dto.user(user), organization: dto.org(org) });
});

exports.me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user, organization: req.org });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { passwordHash: true } });
  if (!user || !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
    throw new ApiError(400, 'Current password is incorrect');
  }
  const hash = await bcrypt.hash(req.body.newPassword, 12);
  await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: hash } });
  res.json({ success: true, message: 'Password updated' });
});
