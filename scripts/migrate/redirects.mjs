// Fills the Redirects table: news stories, every pageant and edition, countries, and the old
// site's fixed pages. Rows that already exist are left alone, so it is safe to re-run.
//
//   npm run migrate:redirects -- --dry-run
//   npm run migrate:redirects
import fs from 'node:fs';
import path from 'node:path';
import { loadStrapi } from './lib/app.mjs';
import {
  importBigFourRedirects,
  importCountryRedirects,
  importFixedPageRedirects,
  importNewsRedirects,
  importPageantRedirects,
  importVideoRedirects,
} from './steps/redirects.mjs';

const dryRun = process.argv.includes('--dry-run');
const strapi = await loadStrapi();
try {
  const news = await importNewsRedirects({ strapi, dryRun });
  const bigFour = await importBigFourRedirects({ strapi, dryRun });
  const pageants = await importPageantRedirects({ strapi, dryRun });
  const countries = await importCountryRedirects({ strapi, dryRun });
  const fixed = await importFixedPageRedirects({ strapi, dryRun });
  const videos = await importVideoRedirects({ strapi, dryRun });
  const stats = {
    news: news.stats,
    bigFour: bigFour.stats,
    pageants: pageants.stats,
    countries: countries.stats,
    fixedPages: fixed.stats,
    videos: videos.stats,
  };
  const errors = [...news.errors, ...bigFour.errors, ...pageants.errors, ...countries.errors, ...fixed.errors, ...videos.errors];
  const outDir = path.resolve('migration-output');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'redirect-errors.json'), JSON.stringify(errors, null, 2));
  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'write', ...stats }, null, 2));
} finally {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await strapi.destroy().catch((error) => console.warn(`Strapi shutdown: ${error.message}`));
}
process.exit(0);
