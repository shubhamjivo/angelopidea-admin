// Event tags: the old site's sub-event tags (Preliminary, Finals, National Costume, …) on news
// (`newstag`) and News in Pictures (`newsinpictag`) become CMS tags on articles and photo stories.
// One tag per row of `subeventmaster`, named as the old site named it. Links are written to both
// the draft and the published version of each story; links already there are kept, so it is safe
// to re-run.
//
//   npm run migrate:event-tags -- --dry-run
//   npm run migrate:event-tags
import { loadStrapi } from './lib/app.mjs';
import { createLegacyPool } from './lib/legacy.mjs';
import { slugify } from './lib/slug.mjs';

const TAG_UID = 'api::tag.tag';
const dryRun = process.argv.includes('--dry-run');

/** Where each kind of story's tags live. */
const TARGETS = [
  { label: 'articles', legacyTable: 'newstag', table: 'articles', link: 'articles_tags_lnk', owner: 'article_id' },
  { label: 'photo stories', legacyTable: 'newsinpictag', table: 'photo_stories', link: 'photo_stories_tags_lnk', owner: 'photo_story_id' },
];

const legacy = createLegacyPool();
const strapi = await loadStrapi();
const db = strapi.db.connection;
const stats = { tagsCreated: 0, tagsExisting: 0 };
try {
  // 1. One tag per sub-event.
  const { rows: events } = await legacy.query('select sub_id, trim(sub_title) as title from subeventmaster order by sub_id');
  const tagIdBySubevent = new Map();
  for (const event of events) {
    const slug = slugify(event.title);
    let [tag] = await strapi.documents(TAG_UID).findMany({ filters: { slug }, limit: 1 });
    if (tag) stats.tagsExisting += 1;
    else {
      stats.tagsCreated += 1;
      if (!dryRun) tag = await strapi.documents(TAG_UID).create({ data: { name: event.title, slug } });
    }
    // A dry run has no new tag yet; a placeholder lets it count the links all the same.
    tagIdBySubevent.set(String(event.sub_id), tag?.id ?? -event.sub_id);
  }

  // 2. Link every story the old site tagged, by its legacy id.
  for (const target of TARGETS) {
    const { rows } = await legacy.query(
      `select ntag_newsid as news_id, ntag_value as sub_id from ${target.legacyTable} where ntag_type = 'Subevent'`,
    );
    const stories = await db(target.table).select('id', 'legacy_id').whereNotNull('legacy_id');
    const rowsByLegacyId = new Map();
    for (const story of stories) {
      const key = String(story.legacy_id);
      if (!rowsByLegacyId.has(key)) rowsByLegacyId.set(key, []);
      rowsByLegacyId.get(key).push(story.id);
    }
    const links = [];
    let missingStory = 0;
    for (const row of rows) {
      const tagId = tagIdBySubevent.get(String(row.sub_id));
      const owners = rowsByLegacyId.get(String(row.news_id));
      if (!owners || tagId === undefined) {
        missingStory += 1;
        continue;
      }
      for (const owner of owners) links.push({ [target.owner]: owner, tag_id: tagId, tag_ord: 1 });
    }
    let written = 0;
    if (!dryRun) {
      for (let index = 0; index < links.length; index += 500) {
        const result = await db(target.link)
          .insert(links.slice(index, index + 500))
          .onConflict([target.owner, 'tag_id'])
          .ignore()
          .returning('id');
        written += result.length;
      }
    }
    console.log(
      `${target.label}: ${rows.length} old tags, ${links.length} links (draft + published), ` +
        `${dryRun ? 'dry run' : `${written} new`}, ${missingStory} without a story in the CMS`,
    );
  }
  console.log(`tags: ${stats.tagsCreated} created, ${stats.tagsExisting} already there`);
} finally {
  await legacy.end();
  await strapi.destroy();
}
