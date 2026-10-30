const mongoose = require('mongoose');

const tournamentSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true },
    description: String,
    format: { type: String, enum: ['league', 'knockout'], default: 'league' },
    status: { type: String, enum: ['draft', 'registration', 'ongoing', 'completed'], default: 'draft' },
    startDate: Date,
    endDate: Date,
    venue: String,
    rules: {
      pointsWin: { type: Number, default: 3 },
      pointsDraw: { type: Number, default: 1 },
      pointsLoss: { type: Number, default: 0 },
      halfDurationMinutes: { type: Number, default: 20 }, // futsal: 2 x 20 min
    },
    fixturesGenerated: { type: Boolean, default: false },
  },
  { timestamps: true }
);

tournamentSchema.index({ organization: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('Tournament', tournamentSchema);
