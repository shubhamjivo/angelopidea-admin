// SEO and sharing (Open Graph) data: fills each entry's "Search and sharing" fields with what
// the old site put in the page's <title>, meta description, meta keywords and og:image. The
// old site built these from its data when a page was requested; the same rules are applied
// here (see the AngelPages/*.aspx.cs file named for each type). Titles are stored without the
// " | Angelopedia" ending, which the website adds itself. An entry whose fields an editor has
// already filled is left alone, so it is safe to re-run.
//
//   npm run migrate:seo -- --dry-run
//   npm run migrate:seo -- --only polls,predictionGames
//   npm run migrate:seo
import { parseArgs } from 'node:util';
import { loadStrapi } from './lib/app.mjs';
import { htmlToText } from './lib/html.mjs';
import { createLegacyPool } from './lib/legacy.mjs';

const { values } = parseArgs({
  options: { 'dry-run': { type: 'boolean', default: false }, only: { type: 'string' }, overwrite: { type: 'boolean', default: false } },
});
// --overwrite replaces values already filled in, including an editor's: only for correcting an earlier run of this script.
const overwrite = values.overwrite;
const dryRun = values['dry-run'];
const wanted = values.only?.split(',').map((name) => name.trim());

const strapi = await loadStrapi();
const legacy = createLegacyPool();
const plain = (value) => htmlToText(value) || null;
const joined = (parts) => parts.filter(Boolean).join(' | ');
/** The old pages named a pageant's other name only when it differed from the name itself. */
const other = (name, alt) => (plain(alt) && plain(alt) !== plain(name) ? plain(alt) : null);

/** Old-site values per legacy id, and which media field (if any) was the og:image. */
const TYPES = {
  // newsDetail.aspx.cs: title = headline, description = summary, keywords = tags + "Angelopedia",
  // og:image = the story's list picture.
  articles: {
    uid: 'api::article.article',
    shareImage: 'thumbnail',
    async rows() {
      const { rows } = await legacy.query(
        `select n.news_id as id, n.new_news_title as title, n.news_title as fallback, n.news_minidesc as summary,
                (select string_agg(t.ntag_text, ' | ' order by t.ntag_id) from newstag t where t.ntag_newsid = n.news_id) as tags
           from newscontent n`,
      );
      return rows.map((row) => [
        row.id,
        {
          metaTitle: plain(row.title) ?? plain(row.fallback),
          metaDescription: plain(row.summary),
          keywords: joined([row.tags, 'Angelopedia']),
        },
      ]);
    },
  },
  // NewsInPicDetail.aspx.cs: title = album title, description = summary, keywords = "Slideshows | " + tags.
  photoStories: {
    uid: 'api::photo-story.photo-story',
    shareImage: 'cover',
    async rows() {
      const { rows } = await legacy.query(
        `select n.news_id as id, n.news_title as title, n.news_minidesc as summary,
                (select string_agg(t.ntag_text, ' | ' order by t.ntag_id) from newsinpictag t where t.ntag_newsid = n.news_id) as tags
           from newsinpic_content n`,
      );
      return rows.map((row) => [
        row.id,
        { metaTitle: plain(row.title), metaDescription: plain(row.summary), keywords: joined(['Slideshows', row.tags]) },
      ]);
    },
  },
  // MainVideoGallery.aspx.cs: title = video title; description and keywords name the edition.
  // (The old pages also appended a "VideoTags" list that came from a stored procedure not in the copy.)
  videos: {
    uid: 'api::video.video',
    async rows() {
      const { rows } = await legacy.query(
        `select an_videoid as id, an_videodesc as title, an_pageantname as pageant, an_pageantyearname as edition,
                an_eventname as event, an_contestentname as contestant
           from videogallery`,
      );
      return rows.map((row) => {
        // The old "VideoTags": the pageant, edition, part of the pageant and contestant the video is filed under.
        const tags = joined([plain(row.pageant), plain(row.edition), plain(row.event), plain(row.contestant)]);
        return [
          row.id,
          {
            metaTitle: plain(row.title),
            metaDescription: joined([
              plain(row.title),
              plain(row.edition),
              'Live Streaming Online | Full Show Online | Information | Contestants | Winners | Hall of Fame | News | Video Gallery | Photo Gallery',
              tags,
            ]),
            keywords: joined([plain(row.edition), 'Live Streaming Online | Full Show Online', tags]),
          },
        ];
      });
    },
  },
  // Big4PageantInfo / InternationalPageantInfo / CountryPageantInfo .aspx.cs.
  pageants: {
    uid: 'api::pageant.pageant',
    async rows() {
      const { rows } = await legacy.query(
        `select p.pg_id as id, p.pg_name as name, p.pg_altname as alt,
                (select i.info_minidesc from info_content i where i.info_cat = 'Pageant' and i.info_peagent = p.pg_id
                  order by i.info_id limit 1) as summary
           from pageant p`,
      );
      return rows.map((row) => [
        row.id,
        {
          metaTitle: `${plain(row.name)} Information`,
          metaDescription: plain(row.summary),
          keywords: joined([plain(row.name), other(row.name, row.alt), 'Information']),
        },
      ]);
    },
  },
  // Big4PageantYearInfo and its national / international twins.
  editions: {
    uid: 'api::edition.edition',
    async rows() {
      const { rows } = await legacy.query(
        `select y.pgy_id as id, y.pgy_namey as name, y.pgy_anamey as alt,
                (select i.info_minidesc from info_content i where i.info_cat = 'Peageantyear' and i.info_peageantyear = y.pgy_id
                  order by i.info_id limit 1) as summary
           from pagent_year y`,
      );
      return rows.map((row) => [
        row.id,
        {
          metaTitle: `${plain(row.name)} Information`,
          metaDescription: plain(row.summary),
          keywords: joined([plain(row.name), other(row.name, row.alt), 'Information']),
        },
      ]);
    },
  },
  // PollDetails.aspx.cs.
  polls: {
    uid: 'api::poll.poll',
    shareImage: 'image',
    async rows() {
      const { rows } = await legacy.query(
        `select p.poll_id as id, p.poll_title as title, p.poll_questiontext as question,
                (select string_agg(a.answer_text, ', ' order by a.answer_id) from pollanswer_master a where a.poll_id = p.poll_id) as answers
           from poll_master p`,
      );
      return rows.map((row) => [
        row.id,
        {
          metaTitle: `Polls | ${plain(row.title)}`,
          metaDescription: `Opinion Poll, Question - ${plain(row.question)}, Responses - ${row.answers ?? ''}`,
          keywords: 'Polls | Voting',
        },
      ]);
    },
  },
  // predictGameStart.aspx.cs.
  predictionGames: {
    uid: 'api::prediction-game.prediction-game',
    shareImage: 'image',
    async rows() {
      const { rows } = await legacy.query(
        `select c.contest_id as id, c.contesttype as kind, y.pgy_namey as name
           from contest c left join pagent_year y on y.pgy_id = c.pageantyear_id`,
      );
      return rows.map((row) => {
        const name = plain(row.name);
        return [
          row.id,
          {
            // The old page's own <title> never reached the browser; its og:title is what was shown.
            metaTitle: `Prediction Game For ${name}`,
            metaDescription: `Predict The Winner & Vote For Your ${row.kind} Favorites For ${name} | Hot Pics for The Beauty Pageants ${name}`,
            keywords: `Prediction Game | Top Favorites | Hot Picks | Beauty Pageants | ${name}`,
          },
        ];
      });
    },
  },
};

const summary = {};
try {
  for (const [name, type] of Object.entries(TYPES)) {
    if (wanted && !wanted.includes(name)) continue;
    const stats = { read: 0, updated: 0, keptEditorValues: 0, notInCms: 0, failed: 0 };
    summary[name] = stats;
    const values = new Map((await type.rows()).map(([id, seo]) => [Number(id), seo]));
    const versions = await strapi.db.query(type.uid).findMany({
      select: ['documentId', 'legacyId', 'publishedAt'],
      where: { legacyId: { $notNull: true } },
      populate: { seo: true, ...(type.shareImage ? { [type.shareImage]: { select: ['id'] } } : {}) },
    });
    // One entry per story: published if either version is, and an editor's SEO on either version wins.
    const documents = new Map();
    for (const row of versions) {
      const entry = documents.get(row.documentId) ?? { legacyId: row.legacyId, published: false, edited: false, image: null };
      entry.published ||= Boolean(row.publishedAt);
      entry.edited ||= Boolean(row.seo?.metaTitle || row.seo?.metaDescription || row.seo?.keywords);
      entry.image ??= type.shareImage ? (row[type.shareImage]?.id ?? null) : null;
      documents.set(row.documentId, entry);
    }
    const service = strapi.documents(type.uid);
    let index = 0;
    for (const [documentId, entry] of documents) {
      index += 1;
      stats.read += 1;
      const seo = values.get(Number(entry.legacyId));
      if (!seo) {
        stats.notInCms += 1;
        continue;
      }
      if (entry.edited && !overwrite) {
        stats.keptEditorValues += 1;
        continue;
      }
      try {
        if (!dryRun) {
          await service.update({ documentId, data: { seo: { ...seo, shareImage: entry.image, noIndex: false } } });
          if (entry.published) await service.publish({ documentId });
        }
        stats.updated += 1;
      } catch (error) {
        stats.failed += 1;
        console.error(`${name} ${entry.legacyId}: ${error.message}`);
      }
      if (index % 1000 === 0) console.log(`  ${name} ${index}/${documents.size}`);
    }
    console.log(`${name}: ${JSON.stringify(stats)}`);
  }
  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'write', ...summary }, null, 2));
} finally {
  await legacy.end();
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await strapi.destroy().catch((error) => console.warn(`Strapi shutdown: ${error.message}`));
}
process.exit(0);
