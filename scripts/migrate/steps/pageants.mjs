import { cleanBody, htmlToText, imageSources } from '../lib/html.mjs';
import { createSlugRegistry, legacySlug } from '../lib/slug.mjs';
import { createUpserter, integer, text } from '../lib/upsert.mjs';
import { legacyImagePath } from './articles.mjs';

const UID = {
  continent: 'api::continent.continent',
  country: 'api::country.country',
  galleryPhoto: 'api::gallery-photo.gallery-photo',
  pageant: 'api::pageant.pageant',
  edition: 'api::edition.edition',
  contestant: 'api::contestant.contestant',
  entry: 'api::edition-entry.edition-entry',
  video: 'api::video.video',
  article: 'api::article.article',
};

const TIERS = { big4: 'big4', international: 'international', regional: 'regional', country: 'national' };
/** Dates were entered as days in India, so read them in that zone to get the day back. */
const day = (column) => `to_char(${column} at time zone 'Asia/Kolkata', 'YYYY-MM-DD')`;
const progress = (label, index, total) => {
  if ((index + 1) % 1000 === 0) console.log(`  ${label} ${index + 1}/${total}`);
};

/** Cleans a legacy info page and registers the pictures it refers to (by path only). */
async function aboutHtml(html, media, alternativeText) {
  if (!String(html ?? '').trim()) return null;
  const files = new Map();
  for (const src of imageSources(html)) {
    const target = legacyImagePath(src);
    const file = target && (await media.ensureFile(target.dir, target.file, { alternativeText }));
    if (file) files.set(src, file);
  }
  return cleanBody(html, { resolveImage: (src) => files.get(src)?.url ?? null }).html || null;
}

async function infoPictures(legacy, media, category, column, id, alternativeText) {
  const { rows } = await legacy.query(
    `select infopicname from infopic where infopiccat = $1 and ${column} = $2 order by infopic_id`,
    [category, id],
  );
  const files = [];
  for (const row of rows) {
    const file = await media.ensureFile('infopic', row.infopicname, { alternativeText });
    if (file) files.push(file.id);
  }
  return files;
}

async function importContinents(ctx) {
  const up = await createUpserter(ctx.strapi, UID.continent, ctx.options);
  const slugs = createSlugRegistry(up.slugs);
  const { rows } = await ctx.legacy.query('select * from continent_master order by cont_id');
  for (const row of rows) {
    await up.save(row.cont_id, {
      name: text(row.cont_name),
      slug: up.slugOf(row.cont_id) ?? slugs.claim(row.cont_name, [row.cont_id]).slug,
      order: row.cont_sortingindex,
      legacyId: Number(row.cont_id),
    });
  }
  return up;
}

async function importCountries(ctx) {
  const continents = await createUpserter(ctx.strapi, UID.continent, ctx.options);
  const up = await createUpserter(ctx.strapi, UID.country, ctx.options);
  const slugs = createSlugRegistry(up.slugs);
  const { rows } = await ctx.legacy.query('select * from country_master order by count_id');
  for (const row of rows) {
    const flag = row.count_flag && (await ctx.media.ensureFile('FlagIcons', row.count_flag.trim(), { alternativeText: `Flag of ${row.count_name}` }));
    await up.save(row.count_id, {
      name: text(row.count_name),
      slug: up.slugOf(row.count_id) ?? slugs.claim(row.count_name, [row.count_id]).slug,
      flag: flag?.id ?? null,
      iso2: text(row.count_alpha2code, 2),
      iso3: text(row.count_alpha3code, 3),
      continent: continents.documentId(row.count_continentid),
      legacyId: Number(row.count_id),
    });
  }
  return up;
}

async function importPageants(ctx) {
  const countries = await createUpserter(ctx.strapi, UID.country, ctx.options);
  const up = await createUpserter(ctx.strapi, UID.pageant, ctx.options);
  const slugs = createSlugRegistry(up.slugs);
  const { rows } = await ctx.legacy.query(
    `select p.*, i.info_minidesc, i.info_content1
       from pageant p
       left join lateral (select * from info_content where info_cat = 'Pageant' and info_peagent = p.pg_id
                           order by info_id desc limit 1) i on true
      order by p.pg_id`,
  );
  for (const row of rows) {
    const name = text(row.pg_name);
    const logo = row.pg_logo && (await ctx.media.ensureFile('PageantLogo', row.pg_logo.trim(), { alternativeText: `${name} logo` }));
    await up.save(
      row.pg_id,
      {
        name,
        // The other name the old site gave the pageant (Miss Mundo Angola); used in its SEO text.
        alternateName: text(row.pg_altname),
        slug: up.slugOf(row.pg_id) ?? slugs.claim(name, [row.pg_id]).slug,
        tier: TIERS[String(row.pg_pagelabel ?? '').toLowerCase()] ?? 'other',
        country: row.pg_pagelabelid ? countries.documentId(row.pg_pagelabelid) : null,
        logo: logo?.id ?? null,
        motto: text(row.pg_motto),
        foundedYear: integer(row.pg_yoc),
        headquarters: text(row.pg_headquater),
        organisation: text(row.pg_orgination),
        president: text(row.pg_president),
        keyPeople: text(row.pg_keypeople, 2000),
        website: text(row.pg_offweb),
        facebook: text(row.pg_fbpage),
        intro: htmlToText(row.info_minidesc) || null,
        about: await aboutHtml(row.info_content1, ctx.media, name),
        images: await infoPictures(ctx.legacy, ctx.media, 'Pageant', 'infopic_pageant', row.pg_id, name),
        legacyId: Number(row.pg_id),
      },
      { publish: row.pg_isactive !== false },
    );
  }
  return up;
}

async function importEditions(ctx) {
  const pageants = await createUpserter(ctx.strapi, UID.pageant, ctx.options);
  const up = await createUpserter(ctx.strapi, UID.edition, ctx.options);
  const slugs = createSlugRegistry(up.slugs);
  const { rows } = await ctx.legacy.query(
    `select y.*, ${day('y.pgy_etadate')} as final_date, i.info_minidesc, i.info_content1
       from pagent_year y
       left join lateral (select * from info_content where info_cat = 'Peageantyear' and info_peageantyear = y.pgy_id
                           order by info_id desc limit 1) i on true
      order by y.pgy_id`,
  );
  for (const [index, row] of rows.entries()) {
    const name = text(row.pgy_namey) ?? `${row.pgy_name} ${row.pgy_ryear}`;
    await up.save(
      row.pgy_id,
      {
        name,
        alternateName: text(row.pgy_anamey),
        slug: up.slugOf(row.pgy_id) ?? slugs.claim(name, [row.pgy_id]).slug,
        pageant: pageants.documentId(row.pgy_nameid),
        year: integer(row.pgy_ryear),
        editionNumber: integer(row.pgy_edition),
        finalDate: row.final_date,
        venue: text(row.pgy_eventvenue),
        city: text(row.pgy_eventcityname),
        intro: htmlToText(row.info_minidesc) || null,
        about: await aboutHtml(row.info_content1, ctx.media, name),
        images: await infoPictures(ctx.legacy, ctx.media, 'Peageantyear', 'infopic_pageantyear', row.pgy_id, name),
        legacyId: Number(row.pgy_id),
      },
      { publish: row.pgy_isactive !== false },
    );
    progress('editions', index, rows.length);
  }
  return up;
}

async function importContestants(ctx) {
  const countries = await createUpserter(ctx.strapi, UID.country, ctx.options);
  const up = await createUpserter(ctx.strapi, UID.contestant, ctx.options);
  const slugs = createSlugRegistry(up.slugs);
  const { rows } = await ctx.legacy.query(
    `select c.*, ${day('c.cons_dob')} as dob, ${day('c.cons_asondate')} as as_on, co.count_name,
            r.likes, r.dislikes, r.loves, r.flowers, p.pic_name
       from contestent_profile c
       left join country_master co on co.count_id = c.cons_countryid
       left join (select contestent_id, sum(table_like)::int as likes, sum(table_dislike)::int as dislikes,
                         sum(table_sendlove)::int as loves, sum(table_sendflower)::int as flowers
                    from conlikedislike group by 1) r on r.contestent_id = c.cons_id
       left join lateral (select g.pic_name from pgyconspic g join pagent_year y on y.pgy_id = g.pageantyear_id
                           where g.contestent_id = c.cons_id order by y.pgy_ryear desc, g.pic_id desc limit 1) p on true
      order by c.cons_id ${ctx.options.limit ? `limit ${Number(ctx.options.limit)}` : ''}`,
  );
  for (const [index, row] of rows.entries()) {
    const name = text(row.cons_name) ?? `Contestant ${row.cons_id}`;
    const portrait = row.pic_name && (await ctx.media.ensureFile('ContestentPageantYear', row.pic_name.trim(), { alternativeText: name }));
    await up.save(row.cons_id, {
      name,
      slug: up.slugOf(row.cons_id) ?? slugs.claim(name, [row.count_name, row.cons_id].filter(Boolean)).slug,
      alternateName: text(row.cons_altname),
      country: countries.documentId(row.cons_countryid),
      portrait: portrait?.id ?? null,
      dateOfBirth: row.dob,
      age: row.cons_age > 0 ? row.cons_age : null,
      ageAsOf: row.cons_age > 0 ? row.as_on : null,
      heightCm: positive(row.cons_heightcm),
      website: text(row.cons_officalsite),
      facebook: text(row.cons_officalfbpage),
      instagram: text(row.cons_handle),
      likes: row.likes ?? 0,
      dislikes: row.dislikes ?? 0,
      loves: row.loves ?? 0,
      flowers: row.flowers ?? 0,
      legacyId: Number(row.cons_id),
    });
    progress('contestants', index, rows.length);
  }
  return up;
}

const positive = (value) => (Number(value) > 0 ? Number(value) : null);

/**
 * The photo gallery: one Gallery Photo per `general_gallery` row, filed under
 * its contestant, edition and pageant, with the old site's category.
 */
async function importGalleryPhotos(ctx) {
  const up = await createUpserter(ctx.strapi, UID.galleryPhoto, ctx.options);
  const pageants = await createUpserter(ctx.strapi, UID.pageant, ctx.options);
  const editions = await createUpserter(ctx.strapi, UID.edition, ctx.options);
  const contestants = await createUpserter(ctx.strapi, UID.contestant, ctx.options);
  const { rows } = await ctx.legacy.query(
    `select g.*, ${day('g.gallery_created')} as posted from general_gallery g
      order by g.gallery_id ${ctx.options.limit ? `limit ${Number(ctx.options.limit)}` : ''}`,
  );
  for (const [index, row] of rows.entries()) {
    // Already imported photos are not rewritten: the gallery is large and a re-run should be quick.
    if (up.documentId(row.gallery_id)) {
      up.stats.read += 1;
      up.stats.skipped = (up.stats.skipped ?? 0) + 1;
      continue;
    }
    const file = await ctx.media.ensureFile('GeneralGallery', String(row.gallery_pic ?? '').trim(), {
      alternativeText: text(row.gallery_contestentname) ?? text(row.gallery_pageantyearname),
    });
    if (!file) {
      up.stats.read += 1;
      up.stats.failed += 1;
      up.errors.push({ uid: UID.galleryPhoto, legacyId: row.gallery_id, message: `no usable file name: ${row.gallery_pic}` });
      continue;
    }
    await up.save(row.gallery_id, {
      image: file.id,
      category: text(row.gallery_category),
      description: String(row.general_picdesc ?? '').trim() || null,
      contestant: contestants.documentId(row.gallery_contestentid),
      edition: editions.documentId(row.gallery_pageantyearid),
      pageant: pageants.documentId(row.gallery_pageantid),
      eventName: text(row.gallery_eventname),
      awardName: text(row.gallery_awardname),
      postedOn: row.posted,
      legacyId: Number(row.gallery_id),
    });
    progress('gallery photos', index, rows.length);
  }
  return up;
}

/** Sorts a legacy award title into the broad result an entry page groups by. */
export function placementOf(award) {
  const label = String(award ?? '').trim();
  if (!label) return 'none';
  if (/^winner$/i.test(label)) return 'winner';
  if (/runner[\s-]*up/i.test(label)) return 'runnerUp';
  if (/^top\s*\d+/i.test(label)) return 'finalist';
  return 'special';
}

/** Legacy ids for entries that only exist as a `winner` row sit above every real `pgyconspic` id. */
const WINNER_ONLY_OFFSET = 10_000_000;

async function importEntries(ctx) {
  const editions = await createUpserter(ctx.strapi, UID.edition, ctx.options);
  const contestants = await createUpserter(ctx.strapi, UID.contestant, ctx.options);
  const countries = await createUpserter(ctx.strapi, UID.country, ctx.options);
  const up = await createUpserter(ctx.strapi, UID.entry, ctx.options);

  const titles = new Map();
  const titleRows = await ctx.legacy.query('select winner_id, wtitle_award from winnertitle order by winner_id, wtitle_order, wtitle_id');
  for (const row of titleRows.rows) {
    if (!titles.has(row.winner_id)) titles.set(row.winner_id, []);
    titles.get(row.winner_id).push(row.wtitle_award);
  }

  const { rows } = await ctx.legacy.query(
    `select coalesce(g.pic_id, ${WINNER_ONLY_OFFSET} + w.winner_id) as entry_id,
            coalesce(g.pageantyear_id, w.winner_pageantyearid) as edition_id,
            coalesce(g.contestent_id, w.winner_contestentid) as contestant_id,
            coalesce(nullif(g.country_id, 0), c.cons_countryid) as country_id,
            g.pic_name, g.pic_order, c.cons_name, y.pgy_namey,
            w.winner_id, w.winner_dorder, w.pic as winner_pic, a.award_title
       from pgyconspic g
       full join winner w on w.winner_pageantyearid = g.pageantyear_id and w.winner_contestentid = g.contestent_id
       join contestent_profile c on c.cons_id = coalesce(g.contestent_id, w.winner_contestentid)
       join pagent_year y on y.pgy_id = coalesce(g.pageantyear_id, w.winner_pageantyearid)
       left join awardmaster a on a.award_id = w.winner_awardid
      order by 1 ${ctx.options.limit ? `limit ${Number(ctx.options.limit)}` : ''}`,
  );
  for (const [index, row] of rows.entries()) {
    const label = `${row.cons_name} · ${row.pgy_namey}`.slice(0, 255);
    const own = (titles.get(row.winner_id) ?? []).map((title) => text(title)).filter(Boolean);
    const main = text(row.award_title) ?? own[0] ?? null;
    const portrait = row.pic_name && (await ctx.media.ensureFile('ContestentPageantYear', row.pic_name.trim(), { alternativeText: label }));
    const winnerPhoto = row.winner_pic && (await ctx.media.ensureFile('Winnerpic', row.winner_pic.trim(), { alternativeText: label }));
    await up.save(row.entry_id, {
      label,
      edition: editions.documentId(row.edition_id),
      contestant: contestants.documentId(row.contestant_id),
      representing: countries.documentId(row.country_id),
      portrait: portrait?.id ?? null,
      order: row.pic_order,
      placement: placementOf(main),
      placementLabel: main,
      placementOrder: row.winner_dorder,
      titles: own.filter((title) => title !== main).map((title, order) => ({ title, order })),
      winnerPhoto: winnerPhoto?.id ?? null,
      legacyId: Number(row.entry_id),
    });
    progress('entries', index, rows.length);
  }
  return up;
}

async function importVideos(ctx) {
  const pageants = await createUpserter(ctx.strapi, UID.pageant, ctx.options);
  const editions = await createUpserter(ctx.strapi, UID.edition, ctx.options);
  const contestants = await createUpserter(ctx.strapi, UID.contestant, ctx.options);
  const up = await createUpserter(ctx.strapi, UID.video, ctx.options);
  // Slugs are the old URL title (`an_videodesc`), capitals kept, as on the old video pages.
  const slugs = createSlugRegistry([], { format: legacySlug });
  const { rows } = await ctx.legacy.query(
    `select v.*, ${day('coalesce(v.an_ucreated, v.an_created)')} as posted, r.likes, r.dislikes
       from videogallery v
       left join (select video_id, sum(video_like)::int as likes, sum(video_dislike)::int as dislikes
                    from videolikedislike group by 1) r on r.video_id = v.an_videoid
      order by an_videoid`,
  );
  for (const [index, row] of rows.entries()) {
    const title = text(row.an_videodesc) ?? `Video ${row.an_videoid}`;
    const url = text(row.an_videovalue, 500);
    if (!url || !row.posted) {
      up.stats.read += 1;
      up.stats.failed += 1;
      up.errors.push({ uid: UID.video, legacyId: row.an_videoid, message: 'no video link or date' });
      continue;
    }
    await up.save(row.an_videoid, {
      title,
      slug: slugs.claim(String(row.an_videodesc ?? '').trim() || title, [row.an_videoid]).slug,
      youtubeUrl: url.slice(0, 255),
      startTime: row.an_starttime > 0 ? row.an_starttime : null,
      likes: row.likes ?? 0,
      dislikes: row.dislikes ?? 0,
      exclusive: row.an_videoownership === 'Own',
      // The part of the pageant the video is from (Finals, Preliminary, Swimsuit, …).
      event: text(row.an_eventname),
      publishedOn: row.posted,
      pageant: pageants.documentId(row.an_pageantid),
      edition: editions.documentId(row.an_pageantyearid),
      contestant: contestants.documentId(row.an_contestentid),
      legacyId: Number(row.an_videoid),
    });
    progress('videos', index, rows.length);
  }
  return up;
}

/**
 * Turns the old tag rows on each article into real links to pageants, editions,
 * contestants, countries and continents, and attaches the list thumbnail the
 * old site showed for the story (`news_image`, in the `Newsimage` folder).
 */
async function importArticleLinks(ctx) {
  const targets = {
    Pageant: ['pageants', await createUpserter(ctx.strapi, UID.pageant, ctx.options)],
    Pageant_year: ['editions', await createUpserter(ctx.strapi, UID.edition, ctx.options)],
    Contestent: ['contestants', await createUpserter(ctx.strapi, UID.contestant, ctx.options)],
    Country: ['countries', await createUpserter(ctx.strapi, UID.country, ctx.options)],
    Continent: ['continents', await createUpserter(ctx.strapi, UID.continent, ctx.options)],
  };
  const articles = ctx.options.dryRun
    ? []
    : await ctx.strapi.db.query(UID.article).findMany({ select: ['documentId', 'legacyId', 'publishedAt'] });
  const byLegacy = new Map();
  for (const row of articles) {
    const entry = byLegacy.get(row.legacyId) ?? { documentId: row.documentId, published: false };
    entry.published ||= Boolean(row.publishedAt);
    byLegacy.set(row.legacyId, entry);
  }

  const { rows } = await ctx.legacy.query(
    `select ntag_newsid as news_id, ntag_type as type, array_agg(distinct ntag_value order by ntag_value) as ids
       from newstag where ntag_type = any($1) group by 1, 2 order by 1`,
    [Object.keys(targets)],
  );
  const links = new Map();
  for (const row of rows) {
    const [field, upserter] = targets[row.type];
    const documentIds = row.ids.map((id) => upserter.documentId(id)).filter(Boolean);
    if (!links.has(row.news_id)) links.set(row.news_id, emptyLinks());
    links.get(row.news_id)[field] = documentIds;
  }

  const thumbs = await ctx.legacy.query(
    `select news_id, news_image, coalesce(new_news_title, news_title) as title
       from newscontent where coalesce(trim(news_image), '') <> '' order by news_id`,
  );
  for (const row of thumbs.rows) {
    const file = await ctx.media.ensureFile('Newsimage', row.news_image.trim(), { alternativeText: text(row.title) });
    if (!file) continue;
    if (!links.has(row.news_id)) links.set(row.news_id, emptyLinks());
    links.get(row.news_id).thumbnail = file.id;
  }

  if (ctx.options.latest) {
    const newest = [...links.keys()].sort((a, b) => Number(b) - Number(a)).slice(0, ctx.options.latest);
    for (const id of [...links.keys()]) if (!newest.includes(id)) links.delete(id);
  }

  const stats = { read: links.size, updated: 0, skipped: 0, failed: 0 };
  const errors = [];
  const documents = ctx.strapi.documents(UID.article);
  let index = 0;
  for (const [newsId, data] of links) {
    const article = byLegacy.get(Number(newsId));
    if (!article) stats.skipped += 1;
    else {
      try {
        await documents.update({ documentId: article.documentId, data });
        if (article.published) await documents.publish({ documentId: article.documentId });
        stats.updated += 1;
      } catch (error) {
        stats.failed += 1;
        errors.push({ uid: UID.article, legacyId: newsId, message: error.message });
      }
    }
    progress('article links', index, links.size);
    index += 1;
  }
  return { stats, errors };
}

const emptyLinks = () => ({ pageants: [], editions: [], contestants: [], countries: [], continents: [] });

/** In dependency order: each step needs the ones before it. */
export const STEPS = {
  continents: importContinents,
  countries: importCountries,
  pageants: importPageants,
  editions: importEditions,
  contestants: importContestants,
  entries: importEntries,
  videos: importVideos,
  'article-links': importArticleLinks,
  'gallery-photos': importGalleryPhotos,
};
