const { prisma } = require('../config/db');

const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Unique slug within organizations or a tenant's tournaments.
async function uniqueSlug(table, base, scope = null, runner = prisma) {
  const model = { organizations: 'organization', tournaments: 'tournament' }[table];
  if (!model) throw new Error('Invalid table');
  const root = slugify(base) || 'item';
  let candidate = root;
  let i = 1;
  for (;;) {
    const where = { slug: candidate };
    if (scope) where.organizationId = scope;
    const existing = await runner[model].findFirst({ where, select: { id: true } });
    if (!existing) return candidate;
    candidate = `${root}-${++i}`;
  }
}

module.exports = { slugify, uniqueSlug };
