// Pageant data migration: countries, pageants, editions, contestants, edition
// entries (with placements), videos, and the links from articles to them.
//
//   npm run migrate:pageants -- --dry-run
//   npm run migrate:pageants -- --only pageants,editions
//   npm run migrate:pageants -- --only article-links --latest 500
//   npm run migrate:pageants                       everything, in order (safe to re-run)
//
// Images are registered by path only; see lib/media.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadStrapi } from './lib/app.mjs';
import { createLegacyPool } from './lib/legacy.mjs';
import { createMediaRegistry } from './lib/media.mjs';
import { STEPS } from './steps/pageants.mjs';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    only: { type: 'string' },
    limit: { type: 'string' },
    latest: { type: 'string' },
  },
});
const options = {
  dryRun: values['dry-run'],
  limit: values.limit ? Number(values.limit) : undefined,
  // article-links only: handle just the newest N stories.
  latest: values.latest ? Number(values.latest) : undefined,
};
const wanted = values.only?.split(',').map((name) => name.trim());
const unknown = wanted?.filter((name) => !STEPS[name]) ?? [];
if (unknown.length) throw new Error(`Unknown step: ${unknown.join(', ')}. Steps: ${Object.keys(STEPS).join(', ')}`);

const strapi = await loadStrapi();
const legacy = createLegacyPool();
const summary = { mode: options.dryRun ? 'dry-run' : 'write', steps: {} };
const errors = [];
try {
  const media = await createMediaRegistry(strapi, options);
  for (const [name, run] of Object.entries(STEPS)) {
    if (wanted && !wanted.includes(name)) continue;
    const started = Date.now();
    console.log(`${name}…`);
    const result = await run({ strapi, legacy, media, options });
    summary.steps[name] = { ...result.stats, seconds: Math.round((Date.now() - started) / 1000) };
    errors.push(...result.errors);
  }
  summary.media = media.stats;
  summary.errors = errors.length;

  const outDir = path.resolve('migration-output');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'pageants-summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outDir, 'pageants-errors.json'), JSON.stringify(errors, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await legacy.end();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await strapi.destroy().catch((error) => console.warn(`Strapi shutdown: ${error.message}`));
}
process.exit(0);
