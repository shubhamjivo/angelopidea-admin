// Angelopedia Exclusive: files the videos that were built into the site
// (data/exclusive-videos.json) as CMS entries. Their pictures and clips are the site's own
// files, copied to public/uploads/exclusive/. An entry that already exists (same link) is
// left alone, so editors' changes survive a re-run.
//
//   npm run migrate:exclusive -- --dry-run
//   npm run migrate:exclusive
import fs from 'node:fs';
import path from 'node:path';
import { loadStrapi } from './lib/app.mjs';
import { createMediaRegistry } from './lib/media.mjs';

const UID = 'api::exclusive-video.exclusive-video';
const dryRun = process.argv.includes('--dry-run');
const videos = JSON.parse(fs.readFileSync(new URL('./data/exclusive-videos.json', import.meta.url), 'utf8'));

const strapi = await loadStrapi();
const stats = { read: videos.length, created: 0, existing: 0, failed: 0 };
try {
  const media = await createMediaRegistry(strapi, { dryRun });
  const documents = strapi.documents(UID);
  for (const video of videos) {
    try {
      const [found] = dryRun ? [] : await documents.findMany({ filters: { link: video.href }, status: 'draft', limit: 1 });
      if (found) {
        stats.existing += 1;
        continue;
      }
      const image = video.image
        ? await media.ensureFile('exclusive', path.basename(video.image), { alternativeText: video.title })
        : null;
      const clip = video.video
        ? await media.ensureFile('exclusive', path.basename(video.video), { alternativeText: video.title })
        : null;
      if (!dryRun) {
        await documents.create({
          status: 'published',
          data: {
            title: video.title,
            group: video.group,
            kicker: video.kicker,
            dateLabel: video.date,
            image: image?.id ?? null,
            videoFile: clip?.id ?? null,
            link: video.href,
            order: video.order,
          },
        });
      }
      stats.created += 1;
    } catch (error) {
      stats.failed += 1;
      console.error(`${video.title}: ${error.message}`);
    }
  }
  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'write', ...stats }, null, 2));
} finally {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await strapi.destroy().catch((error) => console.warn(`Strapi shutdown: ${error.message}`));
}
process.exit(0);
