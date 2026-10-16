// News In Pictures migration: photo stories, their pictures, tags and old-address redirects.
//
//   npm run migrate:photos -- --dry-run
//   npm run migrate:photos -- --limit 20
//   npm run migrate:photos                 everything (safe to re-run)
//
// Images are registered by path only (public/uploads/NewsInPic/); see lib/media.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadStrapi } from './lib/app.mjs';
import { createLegacyPool } from './lib/legacy.mjs';
import { createMediaRegistry } from './lib/media.mjs';
import { importAuthors } from './steps/authors.mjs';
import { importPhotoStories, importPhotoStoryRedirects } from './steps/photo-stories.mjs';

const { values } = parseArgs({
  options: { 'dry-run': { type: 'boolean', default: false }, limit: { type: 'string' } },
});
const options = { dryRun: values['dry-run'], limit: values.limit ? Number(values.limit) : undefined };

const strapi = await loadStrapi();
const legacy = createLegacyPool();
try {
  const media = await createMediaRegistry(strapi, options);
  const authors = await importAuthors({ strapi, legacy, dryRun: options.dryRun });
  const stories = await importPhotoStories({ strapi, legacy, media, authors, options });
  const redirects = await importPhotoStoryRedirects({ strapi, options });
  const errors = [...stories.errors, ...redirects.errors];
  const summary = {
    mode: options.dryRun ? 'dry-run' : 'write',
    photoStories: stories.stats,
    redirects: redirects.stats,
    media: media.stats,
    errors: errors.length,
  };
  const outDir = path.resolve('migration-output');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'photo-stories-errors.json'), JSON.stringify(errors, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await legacy.end();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await strapi.destroy().catch((error) => console.warn(`Strapi shutdown: ${error.message}`));
}
process.exit(0);
