const slugify = (s) =>
  String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Generates a slug unique within `filter` scope (e.g. { organization: id })
async function uniqueSlug(Model, base, filter = {}) {
  const root = slugify(base) || 'item';
  let candidate = root;
  let i = 1;
  while (await Model.exists({ ...filter, slug: candidate })) {
    candidate = `${root}-${++i}`;
  }
  return candidate;
}

module.exports = { slugify, uniqueSlug };
