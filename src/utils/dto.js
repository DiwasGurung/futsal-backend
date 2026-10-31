// Shapes DB rows into API responses (never leaks password_hash, nests grouped columns)
exports.user = (u) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, createdAt: u.createdAt,
});

exports.org = (o) => ({
  id: o.id, name: o.name, slug: o.slug, plan: o.plan, logoUrl: o.logoUrl, contactEmail: o.contactEmail,
  isActive: o.isActive,
});

exports.tournament = (t) => {
  if (!t) return t;
  const { pointsWin, pointsDraw, pointsLoss, halfDurationMinutes, ...rest } = t;
  return { ...rest, rules: { pointsWin, pointsDraw, pointsLoss, halfDurationMinutes } };
};

exports.team = (t) => {
  if (!t) return t;
  const { managerName, managerPhone, managerEmail, ...rest } = t;
  return { ...rest, manager: { name: managerName, phone: managerPhone, email: managerEmail } };
};

exports.player = (player) => ({
  ...player,
  ...(player.dateOfBirth && { dateOfBirth: player.dateOfBirth.toISOString().slice(0, 10) }),
});
