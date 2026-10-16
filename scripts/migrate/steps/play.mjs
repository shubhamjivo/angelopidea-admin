import { htmlToText } from '../lib/html.mjs';
import { createSlugRegistry, legacySlug } from '../lib/slug.mjs';
import { createUpserter, integer, text } from '../lib/upsert.mjs';
import { legacyUrlSegment } from './redirects.mjs';

const POLL_UID = 'api::poll.poll';
const GAME_UID = 'api::prediction-game.prediction-game';
const REDIRECT_UID = 'api::redirect.redirect';

/** Keeps a poll's slug when it already is the old URL title; a slug made from a tidied title is replaced. */
function pollSlug(row, current) {
  return current && current === legacySlug(String(row.poll_title ?? '').trim()) ? current : null;
}

/**
 * Polls: one per `poll_master` row with its answers. The old site showed, for
 * each answer, its counter plus the votes logged in `poll_result`; that total
 * is what is stored. The slug is the old URL title (`poll_title`).
 */
export async function importPolls({ strapi, legacy, media, options }) {
  const up = await createUpserter(strapi, POLL_UID, options);
  const slugs = createSlugRegistry(up.slugs, { format: legacySlug });
  const { rows } = await legacy.query(
    `select poll_id, poll_number, poll_title, poll_questiontext, poll_active, poll_image_upload,
            to_char(pollstart_date at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as starts,
            to_char(poll_end_date at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as ends
       from poll_master order by poll_id`,
  );
  const answers = await legacy.query(
    `select a.answer_id, a.poll_id, a.answer_text,
            coalesce(a.poll_counter, 0) + coalesce((select sum(r.poll_noofvotes) from poll_result r
                                                    where r.poll_answeroption = a.answer_id), 0) as votes
       from pollanswer_master a order by a.answer_id`,
  );
  const byPoll = new Map();
  for (const answer of answers.rows) {
    if (!byPoll.has(answer.poll_id)) byPoll.set(answer.poll_id, []);
    byPoll.get(answer.poll_id).push({ label: text(answer.answer_text) ?? 'Untitled', votes: Number(answer.votes) });
  }

  for (const row of rows) {
    const legacyId = Number(row.poll_id);
    const title = text(row.poll_title) ?? `Poll ${legacyId}`;
    const image = row.poll_image_upload?.trim()
      ? await media.ensureFile('PollImage', row.poll_image_upload.trim(), { alternativeText: title })
      : null;
    await up.save(
      legacyId,
      {
        title,
        // From the title exactly as the old site held it (doubled spaces included), so the
        // address matches the old one apart from its number.
        slug: pollSlug(row, up.slugOf(legacyId)) ?? slugs.claim(String(row.poll_title ?? '').trim() || title, [legacyId]).slug,
        question: htmlToText(row.poll_questiontext) || title,
        image: image?.id ?? null,
        options: byPoll.get(row.poll_id) ?? [],
        startDate: row.starts,
        endDate: row.ends,
        pollNumber: text(row.poll_number),
        legacyId,
      },
      { publish: row.poll_active !== false },
    );
  }
  return up;
}

/**
 * Prediction games: one per `contest` row, named after its edition as the old
 * site named it (`pgy_namey`), which also gives the slug. Readers' ballots were
 * tied to user accounts that are not migrated, so they are kept as totals per
 * contestant: how many readers picked her, and how many picked her to win.
 */
export async function importPredictionGames({ strapi, legacy, media, options }) {
  const up = await createUpserter(strapi, GAME_UID, options);
  const slugs = createSlugRegistry(up.slugs, { format: legacySlug });
  const pageants = await createUpserter(strapi, 'api::pageant.pageant', options);
  const editions = await createUpserter(strapi, 'api::edition.edition', options);
  const contestants = await createUpserter(strapi, 'api::contestant.contestant', options);

  const { rows } = await legacy.query(
    `select c.contest_id, c.pageant_id, c.pageantyear_id, c.stopped, c.contesttype, c.contest_desc, c.pic,
            e.pgy_namey as name,
            to_char(c.activetill at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as closes,
            to_char(c.created at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as opened
       from contest c left join pagent_year e on e.pgy_id = c.pageantyear_id
      order by c.contest_id`,
  );
  const tallies = await legacy.query(
    `select contest_id, contestant_id, count(*)::int as votes,
            count(*) filter (where contestant_rank = 1)::int as winner_votes
       from contestresponse group by 1, 2 order by 1, 3 desc, 4 desc, 2`,
  );
  const picksOf = new Map();
  for (const tally of tallies.rows) {
    const contestant = contestants.documentId(tally.contestant_id);
    if (!contestant) continue;
    if (!picksOf.has(tally.contest_id)) picksOf.set(tally.contest_id, []);
    picksOf.get(tally.contest_id).push({ contestant, votes: tally.votes, winnerVotes: tally.winner_votes });
  }

  for (const [index, row] of rows.entries()) {
    const legacyId = Number(row.contest_id);
    const title = text(row.name) ?? `Prediction Game ${legacyId}`;
    const image = row.pic?.trim()
      ? await media.ensureFile('PredictionImage', row.pic.trim(), { alternativeText: title })
      : null;
    await up.save(legacyId, {
      title,
      slug: up.slugOf(legacyId) ?? slugs.claim(title, [legacyId]).slug,
      description: htmlToText(row.contest_desc) || null,
      image: image?.id ?? null,
      predict: text(row.contesttype),
      picks: integer(String(row.contesttype ?? '').replace(/\D+/g, '')),
      openedOn: row.opened,
      closesOn: row.closes,
      stopped: row.stopped === true,
      pageant: pageants.documentId(row.pageant_id),
      edition: editions.documentId(row.pageantyear_id),
      readerPicks: picksOf.get(row.contest_id) ?? [],
      legacyId,
    });
    if ((index + 1) % 50 === 0) console.log(`  prediction games ${index + 1}/${rows.length}`);
  }
  return up;
}

/**
 * Old addresses → new ones: `/Poll/<title>/<id>` and its `/Result` page to the
 * poll, `/Prediction-Game/<edition>/<id>` to the game. Existing rows are left alone.
 */
export async function importPlayRedirects({ strapi, legacy, options }) {
  // Old poll addresses were built from the title as stored, untidied.
  const rawTitles = new Map(
    (await legacy.query('select poll_id, poll_title from poll_master')).rows.map((row) => [Number(row.poll_id), row.poll_title]),
  );
  const where = { publishedAt: { $notNull: true }, legacyId: { $notNull: true } };
  const polls = await strapi.db.query(POLL_UID).findMany({ select: ['legacyId', 'title', 'slug'], where });
  const games = await strapi.db.query(GAME_UID).findMany({ select: ['legacyId', 'title', 'slug'], where });
  const rows = [];
  for (const poll of polls) {
    const old = `/Poll/${legacyUrlSegment(String(rawTitles.get(poll.legacyId) ?? poll.title).trim())}/${poll.legacyId}`;
    rows.push([old, `/Poll/${poll.slug}`], [`${old}/Result`, `/Poll/${poll.slug}`]);
  }
  for (const game of games) {
    rows.push([`/Prediction-Game/${legacyUrlSegment(game.title)}/${game.legacyId}`, `/Prediction-Game/${game.slug}`]);
  }

  const existing = await strapi.db.query(REDIRECT_UID).findMany({
    select: ['documentId', 'source', 'destination'],
    where: { $or: [{ source: { $startsWithi: '/Poll/' } }, { source: { $startsWithi: '/Prediction-Game/' } }] },
  });
  // A poll or game whose slug changed since the last run: its redirects follow it.
  const wanted = new Set(rows.map(([, destination]) => destination));
  const stats = { rows: rows.length, created: 0, existing: 0, repointed: 0, removed: 0, failed: 0 };
  const errors = [];
  const known = new Set();
  for (const row of existing) {
    const match = rows.find(([source]) => source.toLowerCase() === row.source.toLowerCase());
    if (match && match[1] !== row.destination) {
      if (!options.dryRun) await strapi.documents(REDIRECT_UID).update({ documentId: row.documentId, data: { destination: match[1] } });
      stats.repointed += 1;
    } else if (!match && !wanted.has(row.destination)) {
      // An address built from a tidied title that the old site never served.
      if (!options.dryRun) await strapi.documents(REDIRECT_UID).delete({ documentId: row.documentId });
      stats.removed += 1;
      continue;
    }
    known.add(row.source.toLowerCase());
  }
  for (const [source, destination] of rows) {
    if (known.has(source.toLowerCase())) {
      stats.existing += 1;
      continue;
    }
    known.add(source.toLowerCase());
    try {
      if (!options.dryRun) await strapi.documents(REDIRECT_UID).create({ data: { source, destination } });
      stats.created += 1;
    } catch (error) {
      stats.failed += 1;
      errors.push({ source, destination, message: error.message });
    }
  }
  return { stats, errors };
}
