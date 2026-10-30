const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true, index: true },
    name: { type: String, required: true, trim: true },
    shortName: { type: String, trim: true, uppercase: true, maxlength: 6 },
    logoUrl: String,
    manager: { name: String, phone: String, email: String },
  },
  { timestamps: true }
);

teamSchema.index({ tournament: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Team', teamSchema);
