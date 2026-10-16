/**
 * Create-or-update keyed on `legacyId`, so every import step can be re-run.
 * Draft-and-publish types are published unless `publish: false` is passed.
 */
export async function createUpserter(strapi, uid, { dryRun = false } = {}) {
  const type = strapi.contentTypes[uid];
  const drafts = Boolean(type.options?.draftAndPublish);
  const hasSlug = Boolean(type.attributes.slug);
  const rows = dryRun
    ? []
    : await strapi.db.query(uid).findMany({
        select: ['documentId', 'legacyId', ...(hasSlug ? ['slug'] : [])],
        where: { legacyId: { $notNull: true } },
      });
  // Draft and published versions share a documentId, so one entry per legacy id is enough.
  const known = new Map(rows.map((row) => [row.legacyId, row]));
  const stats = { read: 0, created: 0, updated: 0, failed: 0 };
  const errors = [];

  return {
    stats,
    errors,
    known,
    /** Slugs already taken, for seeding a slug registry. */
    slugs: rows.map((row) => row.slug).filter(Boolean),
    documentId: (legacyId) => known.get(Number(legacyId))?.documentId ?? null,
    slugOf: (legacyId) => known.get(Number(legacyId))?.slug ?? null,
    async save(legacyId, data, { publish = true } = {}) {
      stats.read += 1;
      const previous = known.get(Number(legacyId));
      try {
        if (!dryRun) {
          const documents = strapi.documents(uid);
          if (previous) {
            await documents.update({ documentId: previous.documentId, data });
            if (drafts && publish) await documents.publish({ documentId: previous.documentId });
          } else {
            const created = await documents.create({
              data,
              ...(drafts ? { status: publish ? 'published' : 'draft' } : {}),
            });
            known.set(Number(legacyId), { documentId: created.documentId, legacyId: Number(legacyId), slug: data.slug });
          }
        }
        stats[previous ? 'updated' : 'created'] += 1;
      } catch (error) {
        stats.failed += 1;
        const detail = error?.details?.errors?.map((item) => `${item.path?.join('.')}: ${item.message}`).join('; ');
        errors.push({ uid, legacyId, message: error.message, detail });
      }
    },
  };
}

/** Trims a value and keeps it within a short-text column. */
export function text(value, max = 255) {
  const trimmed = String(value ?? '').replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export function integer(value) {
  const number = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(number) ? number : null;
}
