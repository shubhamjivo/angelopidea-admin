// Rebuilds every article slug from the old site's URL title (`legacyTitle`),
// capitals kept, falling back to the headline, and points the Redirects table at the new
// addresses. Safe to re-run: a slug that is already right is left alone.
//
//   npm run migrate:reslug -- --dry-run
//   npm run migrate:reslug
import fs from 'node:fs';
import path from 'node:path';
import { loadStrapi } from './lib/app.mjs';
import { createSlugRegistry, legacySlug } from './lib/slug.mjs';

const ARTICLE_UID = 'api::article.article';
const REDIRECT_UID = 'api::redirect.redirect';
const dryRun = process.argv.includes('--dry-run');

const strapi = await loadStrapi();
try {
  const rows = await strapi.db.query(ARTICLE_UID).findMany({
    select: ['documentId', 'legacyId', 'legacyTitle', 'title', 'slug', 'publishedOn'],
    where: { legacyId: { $notNull: true } },
    orderBy: { legacyId: 'asc' },
  });
  // Draft and published versions share a documentId and must share a slug.
  const articles = [...new Map(rows.map((row) => [row.documentId, row])).values()];

  const slugs = createSlugRegistry([], { format: legacySlug });
  const changes = [];
  const collisions = [];
  for (const article of articles) {
    const source = String(article.legacyTitle ?? '').trim() || article.title;
    const year = article.publishedOn ? String(article.publishedOn).slice(0, 4) : null;
    const { slug, collided } = slugs.claim(source, [year, article.legacyId].filter(Boolean));
    if (collided) collisions.push({ legacyId: article.legacyId, slug });
    if (slug !== article.slug) changes.push({ ...article, next: slug });
  }

  let redirects = 0;
  if (!dryRun) {
    for (const [index, change] of changes.entries()) {
      await strapi.db
        .query(ARTICLE_UID)
        .updateMany({ where: { documentId: change.documentId }, data: { slug: change.next } });
      const moved = await strapi.db.query(REDIRECT_UID).updateMany({
        where: { destination: `/news/${change.slug}` },
        data: { destination: `/news/${change.next}` },
      });
      redirects += moved.count;
      if ((index + 1) % 2000 === 0) console.log(`  slugs ${index + 1}/${changes.length}`);
    }
  }

  const outDir = path.resolve('migration-output');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'reslug-changes.csv'),
    `legacyId,old,new\n${changes.map((c) => `${c.legacyId},${c.slug},${c.next}`).join('\n')}\n`,
  );
  console.log(
    JSON.stringify(
      {
        mode: dryRun ? 'dry-run' : 'write',
        articles: articles.length,
        changed: changes.length,
        unchanged: articles.length - changes.length,
        collisions: collisions.length,
        redirectsUpdated: redirects,
        sample: changes.slice(-3).map((c) => ({ old: c.slug, new: c.next })),
      },
      null,
      2,
    ),
  );
} finally {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await strapi.destroy().catch((error) => console.warn(`Strapi shutdown: ${error.message}`));
}
process.exit(0);
