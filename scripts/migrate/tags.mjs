// Homepage tags: creates the tags that place a story in a homepage block. When run against a
// schema that still has the old tick boxes (topStory, headline, mostRead), it also moves those
// onto the tags. Existing tags and tags already on a story are kept, so it is safe to re-run.
//
//   npm run migrate:tags -- --dry-run
//   npm run migrate:tags
import { loadStrapi } from './lib/app.mjs';

const TAG_UID = 'api::tag.tag';
const ARTICLE_UID = 'api::article.article';
const dryRun = process.argv.includes('--dry-run');

/** The tags the homepage looks for, by slug. */
export const HOMEPAGE_TAGS = [
  { name: 'Top story', slug: 'top-story', description: 'Shown in the large tiles at the top of the homepage (the four newest).' },
  { name: 'Headline', slug: 'headline', description: 'Listed under "More headlines" on the homepage (the six newest).' },
  { name: 'Most read', slug: 'most-read', description: 'Listed under "Most read" on the homepage (the five newest).' },
];
/** The tick box each tag replaces. */
const FROM_FLAG = { 'top-story': 'topStory', headline: 'headline', 'most-read': 'mostRead' };

const strapi = await loadStrapi();
const stats = { tagsCreated: 0, tagsExisting: 0, storiesTagged: 0, failed: 0 };
try {
  const tags = strapi.documents(TAG_UID);
  const articles = strapi.documents(ARTICLE_UID);
  const attributes = strapi.contentTypes[ARTICLE_UID].attributes;
  for (const tag of HOMEPAGE_TAGS) {
    let [found] = await tags.findMany({ filters: { slug: tag.slug }, limit: 1 });
    if (found) stats.tagsExisting += 1;
    else {
      stats.tagsCreated += 1;
      if (!dryRun) found = await tags.create({ data: tag });
    }
    const flag = FROM_FLAG[tag.slug];
    if (!attributes[flag] || !found) continue;
    // Each version of a story (draft, published) that carries the tick box.
    const rows = await strapi.db.query(ARTICLE_UID).findMany({
      select: ['documentId', 'publishedAt'],
      where: { [flag]: true },
      populate: { tags: { select: ['documentId'] } },
    });
    const stories = new Map();
    for (const row of rows) {
      const entry = stories.get(row.documentId) ?? { published: false, tags: new Set() };
      entry.published ||= Boolean(row.publishedAt);
      for (const item of row.tags ?? []) entry.tags.add(item.documentId);
      stories.set(row.documentId, entry);
    }
    for (const [documentId, entry] of stories) {
      if (entry.tags.has(found.documentId)) continue;
      try {
        if (!dryRun) {
          await articles.update({ documentId, data: { tags: [...entry.tags, found.documentId] } });
          if (entry.published) await articles.publish({ documentId });
        }
        stats.storiesTagged += 1;
      } catch (error) {
        stats.failed += 1;
        console.error(`${documentId}: ${error.message}`);
      }
    }
  }
  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'write', ...stats }, null, 2));
} finally {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await strapi.destroy().catch((error) => console.warn(`Strapi shutdown: ${error.message}`));
}
process.exit(0);
