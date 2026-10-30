const mongoose = require('mongoose');
const ApiError = require('./ApiError');

// Loads a document only if it belongs to the caller's organization (tenant isolation)
module.exports = async (Model, id, orgId) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(404, `${Model.modelName} not found`);
  const doc = await Model.findOne({ _id: id, organization: orgId });
  if (!doc) throw new ApiError(404, `${Model.modelName} not found`);
  return doc;
};
