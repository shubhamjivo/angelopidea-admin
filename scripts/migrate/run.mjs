// News migration: legacy `newscontent` → Strapi articles and authors.
//
//   npm run migrate -- --dry-run            read and convert everything, write nothing
//   npm run migrate -- --latest 200         import the 200 newest articles
//   npm run migrate -- --ids 57764,208      import specific legacy ids
//   npm run migrate                         import everything (safe to re-run)
//
// Images are registered by path only; see lib/media.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadStrapi } from './lib/app.mjs';
import { createLegacyPool } from './lib/legacy.mjs';
import { createMediaRegistry } from './lib/media.mjs';
import { importArticles } from './steps/articles.mjs';
import { importAuthors } from './steps/authors.mjs';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    limit: { type: 'string' },
    latest: { type: 'string' },
    ids: { type: 'string' },
  },
});
const options = {
  dryRun: values['dry-run'],
  limit: values.limit ? Number(values.limit) : undefined,
  latest: values.latest ? Number(values.latest) : undefined,
  ids: values.ids?.split(',').map(Number).filter(Number.isFinite),
};

const strapi = await loadStrapi();
const legacy = createLegacyPool();
const report = { slugCollisions: [], flagged: [], flagCounts: {}, errors: [] };
const started = Date.now();

try {
  const media = await createMediaRegistry(strapi, options);
  const authors = await importAuthors({ strapi, legacy, dryRun: options.dryRun });
  const articles = await importArticles({ strapi, legacy, media, authors, options, report });

  const summary = {
    mode: options.dryRun ? 'dry-run' : 'write',
    options,
    seconds: Math.round((Date.now() - started) / 1000),
    authors: authors.report,
    articles,
    media: media.stats,
    flagCounts: report.flagCounts,
    slugCollisions: report.slugCollisions.length,
    errors: report.errors.length,
  };

  const outDir = path.resolve('migration-output');
  fs.mkdirSync(outDir, { recursive: true });
  const csv = (rows) =>
    rows.map((row) => Object.values(row).map((value) => JSON.stringify(value ?? '')).join(',')).join('\n');
  fs.writeFileSync(path.join(outDir, 'news-summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outDir, 'news-flagged.csv'), `legacyId,slug,flags\n${csv(report.flagged)}\n`);
  fs.writeFileSync(path.join(outDir, 'news-slug-collisions.csv'), `legacyId,title,slug\n${csv(report.slugCollisions)}\n`);
  fs.writeFileSync(path.join(outDir, 'news-errors.csv'), `legacyId,message,detail\n${csv(report.errors)}\n`);

  console.log(JSON.stringify(summary, null, 2));
} finally {
  await legacy.end();
  // Strapi may still be finishing background writes (history, audit) from the last documents.
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await strapi.destroy().catch((error) => console.warn(`Strapi shutdown: ${error.message}`));
}
process.exit(0);
