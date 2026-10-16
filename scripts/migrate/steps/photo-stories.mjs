import { htmlToText } from '../lib/html.mjs';
import { createSlugRegistry, legacySlug } from '../lib/slug.mjs';
import { createUpserter, text } from '../lib/upsert.mjs';
import { legacyUrlSegment } from './redirects.mjs';

const UID = 'api::photo-story.photo-story';
const REDIRECT_UID = 'api::redirect.redirect';
/** The old site kept every picture of a photo story in this folder, and the album covers in its `Thumb` folder. */
const IMAGE_DIR = 'NewsInPic';
const COVER_DIR = 'NewsInPic/Thumb';

const TAG_TARGETS = {
  Pageant: ['pageants', 'api::pageant.pageant'],
  Pageant_year: ['editions', 'api::edition.edition'],
  Contestent: ['contestants', 'api::contestant.contestant'],
  Country: ['countries', 'api::country.country'],
  Continent: ['continents', 'api::continent.continent'],
};

/**
 * News In Pictures: one photo story per `newsinpic_content` row, its pictures
 * from `newsinpic_gallery` in their old order, and its tags turned into links.
 * The cover is the album's own list picture (`news_imagepath`), as on the old site.
 */
export async function importPhotoStories({ strapi, legacy, media, authors, options }) {
  const up = await createUpserter(strapi, UID, options);
  const slugs = createSlugRegistry(up.slugs, { format: legacySlug });

  const { rows } = await legacy.query(
    `select news_id, news_title, news_minidesc, news_author, news_active, news_imagepath,
            to_char(news_datetime at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as posted
       from newsinpic_content order by news_id ${options.limit ? `limit ${Number(options.limit)}` : ''}`,
  );
  const gallery = await legacy.query(
    'select news_id, news_title, news_desc, news_mini_desc, news_imagepath from newsinpic_gallery order by news_id, news_order, news_galleryid',
  );
  const pictures = new Map();
  for (const row of gallery.rows) {
    if (!pictures.has(row.news_id)) pictures.set(row.news_id, []);
    pictures.get(row.news_id).push(row);
  }

  const links = new Map();
  const tags = await legacy.query(
    `select ntag_newsid as news_id, ntag_type as type, array_agg(distinct ntag_value order by ntag_value) as ids
       from newsinpictag where ntag_type = any($1) group by 1, 2`,
    [Object.keys(TAG_TARGETS)],
  );
  const targets = {};
  for (const [type, [, uid]] of Object.entries(TAG_TARGETS)) targets[type] = await createUpserter(strapi, uid, options);
  for (const row of tags.rows) {
    if (!links.has(row.news_id)) links.set(row.news_id, {});
    links.get(row.news_id)[TAG_TARGETS[row.type][0]] = row.ids
      .map((id) => targets[row.type].documentId(id))
      .filter(Boolean);
  }

  for (const [index, row] of rows.entries()) {
    const legacyId = Number(row.news_id);
    const title = text(htmlToText(row.news_title)) ?? `Untitled ${legacyId}`;
    const frames = [];
    for (const picture of pictures.get(row.news_id) ?? []) {
      const heading = text(htmlToText(picture.news_title));
      const file = await media.ensureFile(IMAGE_DIR, String(picture.news_imagepath ?? '').trim(), {
        alternativeText: heading ?? title,
      });
      // The summary is the short version the old picture page used as its description.
      if (file) {
        frames.push({
          image: file.id,
          title: heading,
          summary: htmlToText(picture.news_mini_desc) || null,
          caption: htmlToText(picture.news_desc) || null,
          slug: null,
        });
      }
    }
    // Each picture's own address segment, from its heading as the old site built it; unique within the album.
    const taken = new Set();
    for (const frame of frames) {
      const base = legacySlug(frame.title ?? '');
      if (!base) continue;
      let slug = base;
      for (let n = 2; taken.has(slug.toLowerCase()); n += 1) slug = `${base}-${n}`;
      taken.add(slug.toLowerCase());
      frame.slug = slug;
    }
    const cover = String(row.news_imagepath ?? '').trim()
      ? await media.ensureFile(COVER_DIR, row.news_imagepath.trim(), { alternativeText: title })
      : null;
    const slug = up.slugOf(legacyId) ?? slugs.claim(title, [row.posted?.slice(0, 4), legacyId].filter(Boolean)).slug;

    await up.save(
      legacyId,
      {
        title,
        slug,
        dek: htmlToText(row.news_minidesc) || null,
        cover: cover?.id ?? null,
        frames,
        author: authors.lookup(row.news_author),
        publishedOn: row.posted,
        pageants: [],
        editions: [],
        contestants: [],
        countries: [],
        continents: [],
        ...links.get(row.news_id),
        legacyId,
      },
      { publish: row.news_active !== false && Boolean(row.posted) && frames.length > 0 },
    );
    if ((index + 1) % 100 === 0) console.log(`  photo stories ${index + 1}/${rows.length}`);
  }
  return up;
}

/**
 * The old album address (`/News-In-Picture/<title>-<id>`) → the new one. Rows
 * that already exist are left alone, and an album whose address did not change
 * needs none.
 */
export async function importPhotoStoryRedirects({ strapi, options }) {
  const stories = await strapi.db.query(UID).findMany({
    select: ['legacyId', 'title', 'slug'],
    where: { publishedAt: { $notNull: true }, legacyId: { $notNull: true } },
  });
  const existing = await strapi.db.query(REDIRECT_UID).findMany({ select: ['source'] });
  const known = new Set(existing.map((row) => row.source.toLowerCase()));
  const stats = { stories: stories.length, created: 0, existing: 0, failed: 0 };
  const errors = [];
  for (const story of stories) {
    const source = `/News-In-Picture/${legacyUrlSegment(story.title).replaceAll('?', '')}-${story.legacyId}`;
    const destination = `/News-In-Picture/${story.slug}`;
    if (known.has(source.toLowerCase()) || source.toLowerCase() === destination.toLowerCase()) {
      stats.existing += 1;
      continue;
    }
    known.add(source.toLowerCase());
    try {
      if (!options.dryRun) await strapi.documents(REDIRECT_UID).create({ data: { source, destination } });
      stats.created += 1;
    } catch (error) {
      stats.failed += 1;
      errors.push({ legacyId: story.legacyId, source, message: error.message });
    }
  }
  return { stats, errors };
}
