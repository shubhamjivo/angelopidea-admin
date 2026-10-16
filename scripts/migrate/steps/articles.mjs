import path from 'node:path';
import { cleanBody, htmlToText, imageSources } from '../lib/html.mjs';
import { createSlugRegistry, legacySlug } from '../lib/slug.mjs';

const ARTICLE_UID = 'api::article.article';

const SECTIONS = {
  news: 'news',
  featured: 'featured',
  opinion: 'opinions',
  specials: 'specials',
  interview: 'interviews',
};

/** Legacy image folders, keyed lower-case because old markup is inconsistent about case. */
const IMAGE_DIRS = { newspic: 'newspic', newsimage: 'Newsimage' };

/**
 * Maps an `<img src>` from a legacy body to `{ dir, file }` under the old site
 * root, or null when it does not point at this site.
 */
export function legacyImagePath(src) {
  let value = String(src ?? '').trim();
  const absolute = /^(?:https?:)?\/\/([^/]+)\/(.*)$/i.exec(value);
  if (absolute) {
    if (!/(^|\.)angelopedia\.com$/i.test(absolute[1])) return null;
    value = absolute[2];
  }
  value = value.split(/[?#]/)[0].replace(/^(?:\.\.?\/)+/, '').replace(/^\/+/, '');
  try {
    value = decodeURIComponent(value);
  } catch {
    // keep the raw value when it is not valid percent-encoding
  }
  const dir = path.posix.dirname(value);
  const file = path.posix.basename(value);
  if (!file || dir === '.') return null;
  return { dir: IMAGE_DIRS[dir.toLowerCase()] ?? dir, file };
}

/**
 * Slugs follow the old site's URL title (`news_title`) rather than the display
 * headline, capitals included, so a new address stays as close as possible to
 * the old one.
 */
export function slugSource(row, title) {
  return String(row.news_title ?? '').trim() || title;
}

export async function importArticles({ strapi, legacy, media, authors, options, report }) {
  const { dryRun, limit, latest, ids } = options;

  const where = ids?.length ? 'where news_id = any($1)' : '';
  const order = latest ? 'desc' : 'asc';
  const cap = latest ?? limit;
  const { rows } = await legacy.query(
    `select news_id, news_category, news_title, new_news_title, news_author, news_desc, news_minidesc,
            news_image, news_isactive, news_index,
            to_char(news_posted at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as posted
       from newscontent ${where}
      order by news_id ${order} ${cap ? `limit ${Number(cap)}` : ''}`,
    ids?.length ? [ids] : [],
  );
  rows.sort((a, b) => Number(a.news_id) - Number(b.news_id));

  const pics = new Map();
  const picRows = await legacy.query('select news_id, newspic_name from newspic order by newspic_id');
  for (const pic of picRows.rows) {
    if (!pics.has(pic.news_id)) pics.set(pic.news_id, []);
    pics.get(pic.news_id).push(pic.newspic_name);
  }

  // Draft and published versions share a documentId, so one entry per legacy id is enough.
  const existing = new Map();
  const known = dryRun
    ? []
    : await strapi.db.query(ARTICLE_UID).findMany({ select: ['documentId', 'legacyId', 'slug'] });
  for (const row of known) if (row.legacyId != null) existing.set(row.legacyId, row);
  const slugs = createSlugRegistry(
    known.map((row) => row.slug),
    { format: legacySlug },
  );

  const [topStory] = dryRun ? [] : await strapi.documents('api::tag.tag').findMany({ filters: { slug: 'top-story' }, limit: 1 });
  const topStoryTag = topStory?.documentId ?? null;

  const stats = { read: rows.length, created: 0, updated: 0, published: 0, drafts: 0, failed: 0 };
  let lastDate = null;

  for (const [index, row] of rows.entries()) {
    const legacyId = Number(row.news_id);
    const flags = [];
    try {
      const title = htmlToText(row.new_news_title) || htmlToText(row.news_title) || `Untitled ${legacyId}`;
      const publishedOn = row.posted ?? lastDate;
      if (!row.posted) flags.push('date-inferred');
      lastDate = publishedOn ?? lastDate;

      const previous = existing.get(legacyId);
      let slug = previous?.slug;
      if (!slug) {
        const claimed = slugs.claim(slugSource(row, title), [publishedOn?.slice(0, 4), legacyId].filter(Boolean));
        slug = claimed.slug;
        if (claimed.collided) report.slugCollisions.push({ legacyId, title, slug });
      }

      // Register every image the article refers to, by path only.
      const inlineFiles = new Map();
      for (const src of imageSources(row.news_desc)) {
        const target = legacyImagePath(src);
        const file = target && (await media.ensureFile(target.dir, target.file, { alternativeText: title }));
        if (file) inlineFiles.set(src, file);
      }
      const inlineNames = new Set([...inlineFiles.values()].map((file) => file.name));

      const attached = [];
      for (const name of pics.get(row.news_id) ?? []) {
        const file = await media.ensureFile('newspic', name, { alternativeText: title });
        if (file) attached.push(file);
      }
      // The old site showed `news_image` in story lists and the `newspic` pictures on the story itself.
      const thumbnail = row.news_image?.trim()
        ? await media.ensureFile('Newsimage', row.news_image.trim(), { alternativeText: title })
        : null;
      const cover = attached[0] ?? null;
      if (!cover) flags.push('no-cover');
      const gallery = attached.slice(1).filter((file) => !inlineNames.has(file.name));

      const converted = cleanBody(row.news_desc, {
        resolveImage: (src) => inlineFiles.get(src)?.url ?? null,
      });
      flags.push(...converted.flags);
      if (!converted.hasText && !inlineFiles.size) flags.push('empty-body');

      const section = SECTIONS[String(row.news_category ?? '').trim().toLowerCase()];
      if (!section) flags.push(`unknown-category:${row.news_category}`);

      const data = {
        title,
        slug,
        section: section ?? 'news',
        dek: htmlToText(row.news_minidesc) || null,
        body: converted.html,
        thumbnail: thumbnail?.id ?? null,
        cover: cover ? { image: cover.id } : null,
        gallery: gallery.map((file) => file.id),
        videoUrl: converted.videoUrl,
        author: authors.lookup(row.news_author),
        publishedOn,
        needsReview: flags.some((flag) => ['unmapped-image', 'empty-body'].includes(flag)),
        legacyId,
        legacyTitle: String(row.news_title ?? '').trim() || null,
        legacyHtml: row.news_desc,
      };

      if (flags.length) report.flagged.push({ legacyId, slug, flags: flags.join(' ') });
      for (const flag of flags) report.flagCounts[flag] = (report.flagCounts[flag] ?? 0) + 1;

      const publish = row.news_isactive !== false && Boolean(publishedOn);
      stats[publish ? 'published' : 'drafts'] += 1;
      if (previous) stats.updated += 1;
      else stats.created += 1;

      if (!dryRun) {
        const documents = strapi.documents(ARTICLE_UID);
        if (previous) {
          await documents.update({ documentId: previous.documentId, data });
          if (publish) await documents.publish({ documentId: previous.documentId });
        } else {
          // The old editor's "Top News" tick box becomes the Top story tag. Only on a new story:
          // a re-run never replaces the tags an editor has set since.
          const tags = Number(row.news_index) === 1 && topStoryTag ? [topStoryTag] : [];
          const created = await documents.create({ data: { ...data, tags }, status: publish ? 'published' : 'draft' });
          existing.set(legacyId, { documentId: created.documentId, legacyId, slug });
        }
      }
    } catch (error) {
      stats.failed += 1;
      const detail = error?.details?.errors?.map((item) => `${item.path?.join('.')}: ${item.message}`).join('; ');
      report.errors.push({ legacyId, message: error.message, detail });
    }
    if ((index + 1) % 500 === 0) console.log(`  articles ${index + 1}/${rows.length}`);
  }

  return stats;
}
