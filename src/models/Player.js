const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    name: { type: String, required: true, trim: true },
    jerseyNumber: { type: Number, required: true, min: 0, max: 99 },
    // Futsal positions: goalkeeper, fixo (last defender), ala (winger), pivot (forward)
    position: { type: String, enum: ['goalkeeper', 'fixo', 'ala', 'pivot'] },
    dateOfBirth: Date,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

playerSchema.index({ team: 1, jerseyNumber: 1 }, { unique: true });

module.exports = mongoose.model('Player', playerSchema);
