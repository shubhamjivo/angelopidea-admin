import { errors } from '@strapi/utils';

const REDIRECT_UID = 'api::redirect.redirect';

/** Paths are stored without host, query or trailing slash so lookups compare like with like. */
function normalisePath(value: unknown) {
  let path = String(value ?? '').trim();
  path = path.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path;
}

async function validate(data: Record<string, unknown>) {
  if (data.source !== undefined) {
    data.source = normalisePath(data.source);
    if (!String(data.source).startsWith('/')) {
      throw new errors.ApplicationError('Source URL must start with "/", e.g. /news/Old-Title/123.');
    }
  }
  if (data.destination !== undefined) {
    // A destination may carry a query (`/miss-earth/info?year=2019`); only the source is reduced to a bare path.
    data.destination = String(data.destination).trim();
    if (!/^(\/|https?:\/\/)/i.test(String(data.destination))) {
      throw new errors.ApplicationError('Destination URL must start with "/" or "https://".');
    }
  }
  if (data.source && data.destination && String(data.source).toLowerCase() === String(data.destination).toLowerCase()) {
    throw new errors.ApplicationError('Source and destination are the same address.');
  }
  // A destination that is itself redirected would send visitors through two hops, or in a circle.
  if (typeof data.destination === 'string' && data.destination.startsWith('/')) {
    const chained = await strapi.db.query(REDIRECT_UID).findOne({ where: { source: { $eqi: data.destination } } });
    if (chained) {
      throw new errors.ApplicationError(
        `"${data.destination}" is already redirected to "${chained.destination}". Use that address as the destination instead.`,
      );
    }
  }
}

export default {
  async beforeCreate(event: { params: { data: Record<string, unknown> } }) {
    await validate(event.params.data);
  },
  async beforeUpdate(event: { params: { data: Record<string, unknown> } }) {
    await validate(event.params.data);
  },
};
