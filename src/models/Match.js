const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['goal', 'own_goal', 'yellow_card', 'red_card'], required: true },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    minute: { type: Number, min: 0, max: 120, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const matchSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', required: true },
    round: { type: Number, required: true },
    roundName: String,
    homeTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    awayTeam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: function () { return !this.isBye; },
    },
    scheduledAt: Date,
    court: String,
    status: { type: String, enum: ['scheduled', 'live', 'finished', 'postponed', 'cancelled'], default: 'scheduled' },
    homeScore: { type: Number, default: 0 },
    awayScore: { type: Number, default: 0 },
    penaltyHome: Number, // knockout shootout only
    penaltyAway: Number,
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
    isBye: { type: Boolean, default: false },
    events: [eventSchema],
  },
  { timestamps: true }
);

matchSchema.index({ tournament: 1, round: 1 });
matchSchema.index({ tournament: 1, status: 1 });
matchSchema.index({ organization: 1, scheduledAt: 1 });

module.exports = mongoose.model('Match', matchSchema);
