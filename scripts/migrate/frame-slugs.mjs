// Gives every picture of every photo story its own web address segment (slug),
// made from the picture's heading the way the old site built picture URLs.
// Pictures that already have a slug are left alone, so it is safe to re-run.
//
//   npm run migrate:frame-slugs -- --dry-run
//   npm run migrate:frame-slugs
import { loadStrapi } from './lib/app.mjs';
import { legacySlug } from './lib/slug.mjs';

const UID = 'api::photo-story.photo-story';
const dryRun = process.argv.includes('--dry-run');

const strapi = await loadStrapi();
const stats = { stories: 0, updated: 0, slugsSet: 0, withoutHeading: 0, failed: 0 };
try {
  const documents = strapi.documents(UID);
  const published = new Set(
    (await strapi.db.query(UID).findMany({ select: ['documentId'], where: { publishedAt: { $notNull: true } } })).map(
      (row) => row.documentId,
    ),
  );
  const stories = await documents.findMany({
    status: 'draft',
    fields: ['title'],
    populate: { frames: { populate: { image: { fields: ['id'] } } } },
    limit: 10000,
  });
  for (const story of stories) {
    stats.stories += 1;
    const frames = story.frames ?? [];
    // Within one album two pictures must not share an address.
    const used = new Set(frames.map((frame) => frame.slug?.toLowerCase()).filter(Boolean));
    let changed = 0;
    const next = frames.map((frame) => {
      let slug = frame.slug;
      if (!slug) {
        const base = legacySlug(frame.title ?? '');
        if (!base) stats.withoutHeading += 1;
        else {
          slug = base;
          for (let n = 2; used.has(slug.toLowerCase()); n += 1) slug = `${base}-${n}`;
          used.add(slug.toLowerCase());
          changed += 1;
        }
      }
      return { id: frame.id, image: frame.image?.id ?? null, title: frame.title, caption: frame.caption, slug: slug ?? null };
    });
    if (!changed) continue;
    stats.slugsSet += changed;
    try {
      if (!dryRun) {
        await documents.update({ documentId: story.documentId, data: { frames: next } });
        if (published.has(story.documentId)) await documents.publish({ documentId: story.documentId });
      }
      stats.updated += 1;
    } catch (error) {
      stats.failed += 1;
      console.error(`${story.title}: ${error.message}`);
    }
  }
  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'write', ...stats }, null, 2));
} finally {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await strapi.destroy().catch((error) => console.warn(`Strapi shutdown: ${error.message}`));
}
process.exit(0);
