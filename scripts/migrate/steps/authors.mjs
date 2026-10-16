import { slugify } from '../lib/slug.mjs';

const AUTHOR_UID = 'api::author.author';

/** Legacy bylines are free text; these are the misspellings found in `newscontent.news_author`. */
const CORRECTIONS = {
  angelopdia: 'Angelopedia',
  angeloedia: 'Angelopedia',
  angelopeida: 'Angelopedia',
  'camilla saurez': 'Camilla Suarez',
  'irina silva': 'Irina Silva',
  'farha khan': 'Farah Khan',
};
/** Too short to be a real byline; those articles are left without an author. */
const IGNORED = new Set(['', 'aa']);

export function normaliseAuthor(raw) {
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim();
  const key = name.toLowerCase();
  if (IGNORED.has(key)) return null;
  return CORRECTIONS[key] ?? name;
}

/** Creates any missing authors and returns a lookup from byline to documentId. */
export async function importAuthors({ strapi, legacy, dryRun }) {
  const { rows } = await legacy.query(
    'select news_author as name, count(*)::int as articles from newscontent group by 1 order by 2 desc',
  );
  const names = new Map();
  for (const row of rows) {
    const name = normaliseAuthor(row.name);
    if (name) names.set(name, (names.get(name) ?? 0) + row.articles);
  }

  const existing = dryRun ? [] : await strapi.documents(AUTHOR_UID).findMany({ fields: ['name'], limit: 1000 });
  const byName = new Map(existing.map((author) => [author.name, author.documentId]));
  let created = 0;
  for (const name of names.keys()) {
    if (byName.has(name)) continue;
    created += 1;
    if (dryRun) continue;
    const author = await strapi.documents(AUTHOR_UID).create({ data: { name, slug: slugify(name) } });
    byName.set(name, author.documentId);
  }

  return {
    lookup: (raw) => byName.get(normaliseAuthor(raw)) ?? null,
    report: { authors: Object.fromEntries(names), created, total: names.size },
  };
}
