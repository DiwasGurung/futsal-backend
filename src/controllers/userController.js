const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const findOwned = require('../utils/findOwned');

exports.list = asyncHandler(async (req, res) => {
  const data = await User.find({ organization: req.orgId }).sort('createdAt');
  res.json({ success: true, data });
});

exports.create = asyncHandler(async (req, res) => {
  if (req.body.role === 'admin' && req.user.role !== 'owner') {
    throw new ApiError(403, 'Only the owner can create admins');
  }
  if (await User.exists({ email: req.body.email })) throw new ApiError(409, 'Email already registered');
  const user = await User.create({ ...req.body, organization: req.orgId });
  res.status(201).json({ success: true, data: { id: user._id, name: user.name, email: user.email, role: user.role } });
});

const assertCanManage = (req, target) => {
  if (target.role === 'owner') throw new ApiError(403, 'The owner account cannot be modified');
  if (String(target._id) === String(req.user._id)) throw new ApiError(403, 'You cannot modify your own account here');
  if (req.user.role !== 'owner' && target.role === 'admin') throw new ApiError(403, 'Only the owner can manage admins');
};

exports.update = asyncHandler(async (req, res) => {
  const target = await findOwned(User, req.params.id, req.orgId);
  assertCanManage(req, target);
  if (req.body.role === 'admin' && req.user.role !== 'owner') throw new ApiError(403, 'Only the owner can create admins');
  Object.assign(target, req.body);
  await target.save();
  res.json({ success: true, data: target });
});

exports.remove = asyncHandler(async (req, res) => {
  const target = await findOwned(User, req.params.id, req.orgId);
  assertCanManage(req, target);
  await target.deleteOne();
  res.json({ success: true, message: 'User removed' });
});
