const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { db, tx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { uniqueSlug } = require('../utils/slugify');
const { insertRow } = require('../utils/sql');
const dto = require('../utils/dto');

const signToken = (user) =>
  jwt.sign({ id: user.id, org: user.organizationId, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

// SaaS sign-up: creates a new organization (tenant) and its owner account atomically
exports.register = asyncHandler(async (req, res) => {
  const { organizationName, name, email, password } = req.body;
  const passwordHash = await bcrypt.hash(password, 12);

  const { org, user } = await tx(async (t) => {
    const taken = await t.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (taken.rowCount) throw new ApiError(409, 'Email already registered');

    const slug = await uniqueSlug('organizations', organizationName, null, t);
    const org = await insertRow(t, 'organizations', { name: organizationName, slug, contactEmail: email });
    const user = await insertRow(t, 'users', { organizationId: org.id, name, email, passwordHash, role: 'owner' });
    return { org, user };
  });

  res.status(201).json({ success: true, token: signToken(user), user: dto.user(user), organization: dto.org(org) });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  const org = (await db.query('SELECT * FROM organizations WHERE id = $1', [user.organizationId])).rows[0];
  if (!user.isActive || !org?.isActive) throw new ApiError(403, 'Account is disabled');

  res.json({ success: true, token: signToken(user), user: dto.user(user), organization: dto.org(org) });
});

exports.me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user, organization: req.org });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(req.body.currentPassword, rows[0].passwordHash))) {
    throw new ApiError(400, 'Current password is incorrect');
  }
  const hash = await bcrypt.hash(req.body.newPassword, 12);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
  res.json({ success: true, message: 'Password updated' });
});
