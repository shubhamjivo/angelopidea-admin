import type { Core } from '@strapi/strapi';
import type { Knex } from 'knex';
import type { Context } from 'koa';

const DOCUMENT_ID = /^[a-z0-9]{24}$/;

type GameRow = { id: number; picks: number | null; published_at: Date | null; open: boolean; edition: string | null };

class BallotError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

function contestantIds(value: unknown) {
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string' && DOCUMENT_ID.test(id))) return null;
  return new Set(value).size === value.length ? (value as string[]) : null;
}

/**
 * Adds a ballot to one copy (draft or published) of a game, or takes one back (`change` -1).
 * Every delegate on the ballot is counted once in `votes`; the first, the reader's winner, also
 * in `winnerVotes`. A delegate's first vote adds her to the game's reader picks.
 */
async function count(trx: Knex.Transaction, game: GameRow, ballot: string[], change: 1 | -1) {
  const draft = !game.published_at;
  for (const [index, documentId] of ballot.entries()) {
    const winner = index === 0 ? change : 0;
    // A draft game links to the draft copy of a contestant, a published one to the published copy.
    const person = await trx('contestants')
      .where({ document_id: documentId })
      .andWhere((query) => (draft ? query.whereNull('published_at') : query.whereNotNull('published_at')))
      .first('id');
    if (!person) continue;
    const pick = await trx('prediction_games_cmps as c')
      .join('components_play_reader_picks_contestant_lnk as l', 'l.reader_pick_id', 'c.cmp_id')
      .where({ 'c.entity_id': game.id, 'c.field': 'readerPicks', 'c.component_type': 'play.reader-pick', 'l.contestant_id': person.id })
      .first('c.cmp_id as id');
    if (pick) {
      await trx('components_play_reader_picks')
        .where({ id: pick.id })
        .update({
          votes: trx.raw('GREATEST(COALESCE(votes, 0) + ?, 0)', [change]),
          winner_votes: trx.raw('GREATEST(COALESCE(winner_votes, 0) + ?, 0)', [winner]),
        });
    } else if (change > 0) {
      const [created] = await trx('components_play_reader_picks').insert({ votes: 1, winner_votes: winner }, ['id']);
      const last = await trx('prediction_games_cmps')
        .where({ entity_id: game.id, field: 'readerPicks' })
        .max({ order: 'order' })
        .first();
      await trx('prediction_games_cmps').insert({
        entity_id: game.id,
        cmp_id: created.id,
        component_type: 'play.reader-pick',
        field: 'readerPicks',
        order: Number(last?.order ?? 0) + 1,
      });
      await trx('components_play_reader_picks_contestant_lnk').insert({ reader_pick_id: created.id, contestant_id: person.id });
    }
  }
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * One reader's ballot: `{ picks: [contestant ids, winner first], previous?: [their earlier ballot] }`.
   * `previous` is taken back first, so a reader who changes their prediction is counted once.
   * Both copies of the game are counted, so it does not show as changed in the admin.
   */
  async submit(ctx: Context & { params: { documentId: string }; request: { body?: unknown } }) {
    const body = (ctx.request.body ?? {}) as { picks?: unknown; previous?: unknown };
    const picks = contestantIds(body.picks);
    const previous = body.previous === undefined || body.previous === null ? null : contestantIds(body.previous);
    if (!picks || (body.previous != null && !previous)) return ctx.badRequest('picks (and previous) must be lists of different contestant ids');

    const knex = strapi.db.connection;
    try {
      const ballots = await knex.transaction(async (trx) => {
        // Locking the game's rows makes ballots for the same game wait their turn, so none is lost.
        const games: GameRow[] = await trx('prediction_games as g')
          .leftJoin('prediction_games_edition_lnk as l', 'l.prediction_game_id', 'g.id')
          .leftJoin('editions as e', 'e.id', 'l.edition_id')
          .where('g.document_id', ctx.params.documentId)
          .forUpdate('g')
          .select(
            'g.id',
            'g.picks',
            'g.published_at',
            'e.document_id as edition',
            trx.raw('(NOT COALESCE(g.stopped, false) AND (g.closes_on IS NULL OR g.closes_on >= CURRENT_DATE)) AS open'),
          );
        const live = games.find((game) => game.published_at);
        if (!live) throw new BallotError(404, 'No such game');
        if (!live.open) throw new BallotError(409, 'Voting for this game has closed');
        const size = live.picks ?? 0;
        if (picks.length !== size || (previous && previous.length !== size)) throw new BallotError(400, `A ballot names ${size} delegates`);

        // Only the edition's own delegates can be picked.
        const delegates = new Set(
          (
            await trx('edition_entries_edition_lnk as el')
              .join('editions as e', 'e.id', 'el.edition_id')
              .join('edition_entries_contestant_lnk as cl', 'cl.edition_entry_id', 'el.edition_entry_id')
              .join('contestants as c', 'c.id', 'cl.contestant_id')
              .where('e.document_id', live.edition ?? '')
              .distinct('c.document_id')
          ).map((row: { document_id: string }) => row.document_id),
        );
        if ([...picks, ...(previous ?? [])].some((id) => !delegates.has(id))) throw new BallotError(400, 'Only this edition’s delegates can be picked');

        for (const game of games) {
          if (previous) await count(trx, game, previous, -1);
          await count(trx, game, picks, 1);
        }
        // Every ballot names one winner, so the winner votes add up to the number of readers.
        const total = await trx('prediction_games_cmps as c')
          .join('components_play_reader_picks as r', 'r.id', 'c.cmp_id')
          .where({ 'c.entity_id': live.id, 'c.field': 'readerPicks' })
          .sum({ ballots: 'r.winner_votes' })
          .first();
        return Number(total?.ballots ?? 0);
      });
      ctx.body = { ballots };
    } catch (error) {
      if (error instanceof BallotError) {
        ctx.status = error.status;
        ctx.body = { error: { status: error.status, message: error.message } };
        return;
      }
      throw error;
    }
  },
});
