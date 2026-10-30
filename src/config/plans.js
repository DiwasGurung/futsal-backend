// SaaS plan limits. Wire these to Stripe/Paddle webhooks that update Organization.plan.
module.exports = {
  free:       { maxTournaments: 1,        maxTeamsPerTournament: 8,        maxStaff: 2 },
  pro:        { maxTournaments: 10,       maxTeamsPerTournament: 32,       maxStaff: 10 },
  enterprise: { maxTournaments: Infinity, maxTeamsPerTournament: Infinity, maxStaff: Infinity },
};
