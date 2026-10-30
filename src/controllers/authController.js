const jwt = require('jsonwebtoken');
const env = require('../config/env');
const Organization = require('../models/Organization');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { uniqueSlug } = require('../utils/slugify');

const signToken = (user) =>
  jwt.sign({ id: user._id, org: user.organization, role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

const userDto = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role });
const orgDto = (o) => ({ id: o._id, name: o.name, slug: o.slug, plan: o.plan, logoUrl: o.logoUrl });

// SaaS sign-up: creates a new organization (tenant) and its owner account
exports.register = asyncHandler(async (req, res) => {
  const { organizationName, name, email, password } = req.body;
  if (await User.exists({ email })) throw new ApiError(409, 'Email already registered');

  const slug = await uniqueSlug(Organization, organizationName);
  const org = await Organization.create({ name: organizationName, slug, contactEmail: email });
  try {
    const user = await User.create({ organization: org._id, name, email, password, role: 'owner' });
    res.status(201).json({ success: true, token: signToken(user), user: userDto(user), organization: orgDto(org) });
  } catch (err) {
    await Organization.deleteOne({ _id: org._id });
    throw err;
  }
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password').populate('organization');
  if (!user || !(await user.matchPassword(password))) throw new ApiError(401, 'Invalid email or password');
  if (!user.isActive || !user.organization?.isActive) throw new ApiError(403, 'Account is disabled');

  res.json({ success: true, token: signToken(user), user: userDto(user), organization: orgDto(user.organization) });
});

exports.me = asyncHandler(async (req, res) => {
  res.json({ success: true, user: userDto(req.user), organization: orgDto(req.org) });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchPassword(req.body.currentPassword))) throw new ApiError(400, 'Current password is incorrect');
  user.password = req.body.newPassword;
  await user.save();
  res.json({ success: true, message: 'Password updated' });
});
