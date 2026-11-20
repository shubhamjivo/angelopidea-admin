import type { Core } from '@strapi/strapi';
import type { Context } from 'koa';

/** The reaction a visitor gives → the contestant's counter for it. */
const COLUMNS = { like: 'likes', dislike: 'dislikes', love: 'loves', flower: 'flowers' } as const;
type Kind = keyof typeof COLUMNS;

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * Adds or takes back one reaction. Both the draft and the published copy of the contestant are
   * counted, so the entry does not show as changed in the admin, and a count never drops below 0.
   */
  async react(ctx: Context & { params: { documentId: string }; request: { body?: unknown } }) {
    const { documentId } = ctx.params;
    const { kind, change } = (ctx.request.body ?? {}) as { kind?: Kind; change?: number };
    const column = kind ? COLUMNS[kind] : undefined;
    if (!column || (change !== 1 && change !== -1)) return ctx.badRequest('kind must be like, dislike, love or flower, and change 1 or -1');

    const knex = strapi.db.connection;
    const rows: Array<Record<string, number | string | null>> = await knex('contestants')
      .where({ document_id: documentId })
      .update({ [column]: knex.raw('GREATEST(COALESCE(??, 0) + ?, 0)', [column, change]) }, [
        'likes',
        'dislikes',
        'loves',
        'flowers',
        'published_at',
      ]);
    if (!rows.length) return ctx.notFound();
    const row = rows.find((item) => item.published_at) ?? rows[0];
    ctx.body = {
      like: Number(row.likes ?? 0),
      dislike: Number(row.dislikes ?? 0),
      love: Number(row.loves ?? 0),
      flower: Number(row.flowers ?? 0),
    };
  },
});
