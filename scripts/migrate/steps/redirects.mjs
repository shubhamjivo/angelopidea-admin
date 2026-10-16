const ARTICLE_UID = 'api::article.article';
const REDIRECT_UID = 'api::redirect.redirect';
const PAGEANT_UID = 'api::pageant.pageant';
const EDITION_UID = 'api::edition.edition';

/** The old site's link builder, reproduced exactly (see `CreateUrlStringforlocalityser` in the legacy code). */
export function legacyUrlSegment(value) {
  return String(value ?? '').replaceAll(' ', '-').replaceAll('&', ' ').replaceAll('/', '-');
}

/**
 * One redirect per published article: the address the old site generated
 * (`/news/<title>/<id>`) → the new story address. Rows that already exist are
 * left alone, so anything an editor changed by hand survives a re-run.
 */
export async function importNewsRedirects({ strapi, dryRun }) {
  const articles = await strapi.db.query(ARTICLE_UID).findMany({
    select: ['legacyId', 'legacyTitle', 'title', 'slug'],
    where: { publishedAt: { $notNull: true }, legacyId: { $notNull: true } },
    orderBy: { legacyId: 'asc' },
  });
  const existing = await strapi.db.query(REDIRECT_UID).findMany({ select: ['source'] });
  const known = new Set(existing.map((row) => row.source.toLowerCase()));

  const stats = { articles: articles.length, created: 0, existing: 0, failed: 0 };
  const errors = [];
  for (const [index, article] of articles.entries()) {
    const source = `/news/${legacyUrlSegment(article.legacyTitle ?? article.title)}/${article.legacyId}`;
    if (known.has(source.toLowerCase())) {
      stats.existing += 1;
      continue;
    }
    known.add(source.toLowerCase());
    try {
      if (!dryRun) {
        await strapi.documents(REDIRECT_UID).create({ data: { source, destination: `/news/${article.slug}` } });
      }
      stats.created += 1;
    } catch (error) {
      stats.failed += 1;
      errors.push({ legacyId: article.legacyId, source, message: error.message });
    }
    if ((index + 1) % 2000 === 0) console.log(`  redirects ${index + 1}/${articles.length}`);
  }
  return { stats, errors };
}

/** Old pageant-level tabs → the desk section that replaced each. */
const PAGEANT_TABS = { Info: 'info', News: 'news', Winner: 'hall-of-fame' };
/** Old edition-level tabs. The photo gallery has no successor, so it lands on the edition's info. */
const EDITION_TABS = {
  Info: 'info',
  News: 'news',
  Winner: 'winners',
  Contestants: 'contestants',
  VideoGallery: 'video-gallery',
  PhotoGallery: 'info',
};

/**
 * Redirects for the Big Four desks, which live at `/<pageant slug>/<section>`:
 * three old addresses per pageant and six per edition. An edition that is not
 * published has no year page, so its old addresses land on the pageant itself.
 */
export async function importBigFourRedirects({ strapi, dryRun }) {
  const pageants = await strapi.db.query(PAGEANT_UID).findMany({
    select: ['documentId', 'legacyId', 'name', 'slug'],
    where: { tier: 'big4', publishedAt: { $notNull: true } },
  });
  const rows = [];
  for (const pageant of pageants) {
    const segment = legacyUrlSegment(pageant.name);
    for (const [tab, section] of Object.entries(PAGEANT_TABS)) {
      rows.push([`/Big4-Pageants-${tab}/${segment}/${pageant.legacyId}`, `/${pageant.slug}/${section}`]);
    }
    const versions = await strapi.db.query(EDITION_UID).findMany({
      select: ['legacyId', 'name', 'year', 'publishedAt'],
      where: { pageant: { documentId: pageant.documentId }, legacyId: { $notNull: true } },
    });
    // An edition has a draft and (when live) a published version; it counts as published if either is.
    const editions = new Map();
    for (const version of versions) {
      const edition = editions.get(version.legacyId) ?? { ...version, published: false };
      edition.published ||= Boolean(version.publishedAt);
      editions.set(version.legacyId, edition);
    }
    for (const edition of editions.values()) {
      const name = legacyUrlSegment(edition.name);
      for (const [tab, section] of Object.entries(EDITION_TABS)) {
        const destination = edition.published ? `/${pageant.slug}/${section}?year=${edition.year}` : `/${pageant.slug}/info`;
        rows.push([`/Big4-Pageant-${tab}/${name}/${edition.legacyId}`, destination]);
      }
    }
  }

  const existing = await strapi.db.query(REDIRECT_UID).findMany({ select: ['source'] });
  const known = new Set(existing.map((row) => row.source.toLowerCase()));
  const stats = { pageants: pageants.length, rows: rows.length, created: 0, existing: 0, failed: 0 };
  const errors = [];
  for (const [source, destination] of rows) {
    if (known.has(source.toLowerCase())) {
      stats.existing += 1;
      continue;
    }
    known.add(source.toLowerCase());
    try {
      if (!dryRun) await strapi.documents(REDIRECT_UID).create({ data: { source, destination } });
      stats.created += 1;
    } catch (error) {
      stats.failed += 1;
      errors.push({ source, message: error.message });
    }
  }
  return { stats, errors };
}

const COUNTRY_UID = 'api::country.country';

/**
 * Where each tier's desks live on the new site, and the old route prefixes
 * that led to them. The old site filed regional pageants beside the
 * international ones, so both prefixes are covered for both tiers.
 */
const TIER_ROUTES = {
  national: { prefixes: ['Beauty'], base: (pageant) => pageant.country && `/Beauty-Pageants-Info/${pageant.country.slug}/${pageant.slug}` },
  international: { prefixes: ['International', 'Regional'], base: (pageant) => `/other-pageants/${pageant.slug}` },
  regional: { prefixes: ['International', 'Regional'], base: (pageant) => `/other-pageants/${pageant.slug}` },
};

async function createRedirects(strapi, rows, dryRun) {
  const existing = await strapi.db.query(REDIRECT_UID).findMany({ select: ['source'] });
  const known = new Set(existing.map((row) => row.source.toLowerCase()));
  const stats = { rows: rows.length, created: 0, existing: 0, failed: 0 };
  const errors = [];
  for (const [index, [source, destination]] of rows.entries()) {
    if (known.has(source.toLowerCase())) {
      stats.existing += 1;
      continue;
    }
    known.add(source.toLowerCase());
    try {
      if (!dryRun) await strapi.documents(REDIRECT_UID).create({ data: { source, destination } });
      stats.created += 1;
    } catch (error) {
      stats.failed += 1;
      errors.push({ source, destination, message: error.message });
    }
    if ((index + 1) % 1000 === 0) console.log(`  redirects ${index + 1}/${rows.length}`);
  }
  return { stats, errors };
}

/**
 * Redirects for national, international and regional pageants: three old
 * addresses per pageant and six per edition, built the way the old site built
 * them (`/<Prefix>-Pageants-Info/[<Country>/]<Name>/<id>`). An edition that is
 * not published has no year page, so its old addresses land on the pageant.
 */
export async function importPageantRedirects({ strapi, dryRun }) {
  const pageants = await strapi.db.query(PAGEANT_UID).findMany({
    select: ['documentId', 'legacyId', 'name', 'slug', 'tier'],
    where: { tier: { $in: Object.keys(TIER_ROUTES) }, publishedAt: { $notNull: true }, legacyId: { $notNull: true } },
    populate: { country: { select: ['name', 'slug'] } },
  });
  const versions = await strapi.db.query(EDITION_UID).findMany({
    select: ['legacyId', 'name', 'year', 'publishedAt'],
    where: { legacyId: { $notNull: true } },
    populate: { pageant: { select: ['documentId'] } },
  });
  // An edition has a draft and (when live) a published version; it counts as published if either is.
  const editionsOf = new Map();
  for (const version of versions) {
    const owner = version.pageant?.documentId;
    if (!owner) continue;
    if (!editionsOf.has(owner)) editionsOf.set(owner, new Map());
    const editions = editionsOf.get(owner);
    const edition = editions.get(version.legacyId) ?? { ...version, published: false };
    edition.published ||= Boolean(version.publishedAt);
    editions.set(version.legacyId, edition);
  }

  const rows = [];
  let skipped = 0;
  for (const pageant of pageants) {
    const route = TIER_ROUTES[pageant.tier];
    const base = route.base(pageant);
    if (!base) {
      skipped += 1;
      continue;
    }
    // National addresses carried the country before the pageant's name.
    const lead = pageant.tier === 'national' ? `${legacyUrlSegment(pageant.country.name)}/` : '';
    for (const prefix of route.prefixes) {
      for (const [tab, section] of Object.entries(PAGEANT_TABS)) {
        rows.push([`/${prefix}-Pageants-${tab}/${lead}${legacyUrlSegment(pageant.name)}/${pageant.legacyId}`, `${base}/${section}`]);
      }
      for (const edition of editionsOf.get(pageant.documentId)?.values() ?? []) {
        for (const [tab, section] of Object.entries(EDITION_TABS)) {
          const destination = edition.published && edition.year ? `${base}/${section}?year=${edition.year}` : `${base}/info`;
          rows.push([`/${prefix}-Pageant-${tab}/${lead}${legacyUrlSegment(edition.name)}/${edition.legacyId}`, destination]);
        }
      }
    }
  }
  // The old sitemap listed international pageants under the edition prefix with the pageant's
  // own id (`/International-Pageant-info/Miss-Supranational/27`). Those go to the pageant,
  // unless an edition already answers to that prefix and number.
  const taken = new Set(rows.map(([source]) => source.toLowerCase().replace(/\/.*\//, '/')));
  for (const pageant of pageants) {
    if (pageant.tier === 'national') continue;
    for (const prefix of TIER_ROUTES[pageant.tier].prefixes) {
      const source = `/${prefix}-Pageant-Info/${legacyUrlSegment(pageant.name)}/${pageant.legacyId}`;
      if (taken.has(`/${prefix}-pageant-info/${pageant.legacyId}`)) continue;
      rows.push([source, `${TIER_ROUTES[pageant.tier].base(pageant)}/info`]);
    }
  }

  const result = await createRedirects(strapi, rows, dryRun);
  return { stats: { pageants: pageants.length, skipped, ...result.stats }, errors: result.errors };
}

/**
 * The old country pages (`/Country/<Name>/<id>`): to the country's page when it
 * has national pageants, otherwise to its continent's page.
 */
export async function importCountryRedirects({ strapi, dryRun }) {
  const countries = await strapi.db.query(COUNTRY_UID).findMany({
    select: ['documentId', 'legacyId', 'name', 'slug'],
    where: { publishedAt: { $notNull: true }, legacyId: { $notNull: true } },
    populate: { continent: { select: ['slug'] } },
  });
  const nationals = await strapi.db.query(PAGEANT_UID).findMany({
    select: ['id'],
    where: { tier: 'national', publishedAt: { $notNull: true } },
    populate: { country: { select: ['documentId'] } },
  });
  const withPage = new Set(nationals.map((pageant) => pageant.country?.documentId).filter(Boolean));

  const seen = new Set();
  const rows = [];
  for (const country of countries) {
    if (seen.has(country.legacyId)) continue;
    seen.add(country.legacyId);
    const destination = withPage.has(country.documentId)
      ? `/Beauty-Pageants-Info/${country.slug}`
      : country.continent && `/pageants/${country.continent.slug}`;
    if (destination) rows.push([`/Country/${legacyUrlSegment(country.name)}/${country.legacyId}`, destination]);
  }
  const result = await createRedirects(strapi, rows, dryRun);
  return { stats: { countries: seen.size, ...result.stats }, errors: result.errors };
}

/**
 * The old site's fixed pages and list pages. A list address also stands for
 * its numbered pages (`/Opinions/3`): the site's redirect lookup falls back to
 * the first path segment.
 */
const FIXED_PAGES = [
  ['/Index.aspx', '/'],
  ['/news.html', '/news'],
  ['/News-Home', '/news'],
  ['/Opinions', '/news/opinions'],
  ['/Beauty-talks', '/news/beauty-talks'],
  ['/Featured', '/news/featured'],
  ['/Specials', '/news/specials'],
  ['/Video', '/videos'],
  ['/Big4-Pageant.html', '/#the-big-four'],
  ['/Big4-Pageant', '/#the-big-four'],
  ['/International-Pageant.html', '/other-pageants'],
  ['/International-Pageant', '/other-pageants'],
  ['/Regional-Pageant', '/other-pageants'],
  ['/Continents.html', '/pageants'],
  ['/Asia.html', '/pageants/asia'],
  ['/Africa.html', '/pageants/africa'],
  ['/Europe.html', '/pageants/europe'],
  ['/North-America.html', '/pageants/north-america'],
  ['/Oceania.html', '/pageants/oceania'],
  ['/South-America.html', '/pageants/south-america'],
];

export async function importFixedPageRedirects({ strapi, dryRun }) {
  return createRedirects(strapi, FIXED_PAGES, dryRun);
}

const VIDEO_UID = 'api::video.video';

/** The old video pages (`/Video/<title>/<id>`) → the video's page. A row left from an earlier run is repointed. */
export async function importVideoRedirects({ strapi, dryRun }) {
  const videos = await strapi.db.query(VIDEO_UID).findMany({
    select: ['legacyId', 'title', 'slug'],
    where: { publishedAt: { $notNull: true }, legacyId: { $notNull: true } },
  });
  const rows = videos.map((video) => [`/Video/${legacyUrlSegment(video.title)}/${video.legacyId}`, `/videos/${video.slug}`]);
  const wanted = new Map(rows.map(([source, destination]) => [source.toLowerCase(), destination]));
  const existing = await strapi.db.query(REDIRECT_UID).findMany({
    select: ['documentId', 'source', 'destination'],
    where: { source: { $startsWithi: '/Video/' } },
  });
  let repointed = 0;
  for (const row of existing) {
    const destination = wanted.get(row.source.toLowerCase());
    if (!destination || destination === row.destination) continue;
    if (!dryRun) await strapi.documents(REDIRECT_UID).update({ documentId: row.documentId, data: { destination } });
    repointed += 1;
  }
  const result = await createRedirects(strapi, rows, dryRun);
  return { stats: { videos: videos.length, repointed, ...result.stats }, errors: result.errors };
}
