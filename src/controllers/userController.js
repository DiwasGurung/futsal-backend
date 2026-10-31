const bcrypt = require('bcryptjs');
const { prisma } = require('../config/db');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const findOwned = require('../utils/findOwned');
const dto = require('../utils/dto');

exports.list = asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({ where: { organizationId: req.orgId }, orderBy: { createdAt: 'asc' } });
  res.json({ success: true, data: users.map(dto.user) });
});

exports.create = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (role === 'admin' && req.user.role !== 'owner') throw new ApiError(403, 'Only the owner can create admins');
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new ApiError(409, 'Email already registered');
  }
  const user = await prisma.user.create({
    data: { organizationId: req.orgId, name, email, role, passwordHash: await bcrypt.hash(password, 12) },
  });
  res.status(201).json({ success: true, data: dto.user(user) });
});

const assertCanManage = (req, target) => {
  if (target.role === 'owner') throw new ApiError(403, 'The owner account cannot be modified');
  if (target.id === req.user.id) throw new ApiError(403, 'You cannot modify your own account here');
  if (req.user.role !== 'owner' && target.role === 'admin') throw new ApiError(403, 'Only the owner can manage admins');
};

exports.update = asyncHandler(async (req, res) => {
  const target = await findOwned('users', req.params.id, req.orgId, 'User');
  assertCanManage(req, target);
  if (req.body.role === 'admin' && req.user.role !== 'owner') throw new ApiError(403, 'Only the owner can create admins');
  const user = await prisma.user.update({ where: { id: target.id }, data: req.body });
  res.json({ success: true, data: dto.user(user) });
});

exports.remove = asyncHandler(async (req, res) => {
  const target = await findOwned('users', req.params.id, req.orgId, 'User');
  assertCanManage(req, target);
  await prisma.user.delete({ where: { id: target.id } });
  res.json({ success: true, message: 'User removed' });
});
