// Play Zone migration: polls, prediction games and their old-address redirects.
//
//   npm run migrate:play -- --dry-run
//   npm run migrate:play                 everything (safe to re-run)
//
// Images are registered by path only (public/uploads/PollImage/, PredictionImage/).
import fs from 'node:fs';
import path from 'node:path';
import { loadStrapi } from './lib/app.mjs';
import { createLegacyPool } from './lib/legacy.mjs';
import { createMediaRegistry } from './lib/media.mjs';
import { importPlayRedirects, importPolls, importPredictionGames } from './steps/play.mjs';

const options = { dryRun: process.argv.includes('--dry-run') };
const strapi = await loadStrapi();
const legacy = createLegacyPool();
try {
  const media = await createMediaRegistry(strapi, options);
  const polls = await importPolls({ strapi, legacy, media, options });
  const games = await importPredictionGames({ strapi, legacy, media, options });
  const redirects = await importPlayRedirects({ strapi, legacy, options });
  const errors = [...polls.errors, ...games.errors, ...redirects.errors];
  const outDir = path.resolve('migration-output');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'play-errors.json'), JSON.stringify(errors, null, 2));
  console.log(
    JSON.stringify(
      {
        mode: options.dryRun ? 'dry-run' : 'write',
        polls: polls.stats,
        predictionGames: games.stats,
        redirects: redirects.stats,
        media: media.stats,
        errors: errors.length,
      },
      null,
      2,
    ),
  );
} finally {
  await legacy.end();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await strapi.destroy().catch((error) => console.warn(`Strapi shutdown: ${error.message}`));
}
process.exit(0);
