// Long enough for every legacy title (the longest is 222 characters), so slugs are not cut short.
const MAX_LENGTH = 240;

export function slugify(value, max = MAX_LENGTH) {
  const slug = String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’‘`]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const lastHyphen = cut.lastIndexOf('-');
  return (lastHyphen > max / 2 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/g, '');
}

/**
 * The old site's URL title, kept as close to the original as a slug allows:
 * same capitals, same hyphens (doubled ones included). Only what a slug cannot
 * hold changes: accents are flattened and other punctuation is dropped.
 *
 * Mirrors the old link builder first (space → "-", "&" → " ", "/" → "-").
 */
export function legacySlug(value) {
  return String(value ?? '')
    .trim()
    .replaceAll(' ', '-')
    .replaceAll('&', ' ')
    .replaceAll('/', '-')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\-_.~]/g, '')
    .replace(/\.+$/, '')
    .slice(0, MAX_LENGTH);
}

/**
 * Hands out unique slugs. `suffixes` are tried in order when the base slug is
 * taken (e.g. the year, then the legacy id), so collisions resolve the same
 * way on every run. Two slugs that differ only by capitals count as the same.
 */
export function createSlugRegistry(taken = [], { format = slugify } = {}) {
  const used = new Set(taken.map((slug) => slug.toLowerCase()));
  const has = (slug) => used.has(slug.toLowerCase());
  return {
    has,
    claim(base, suffixes = []) {
      const root = format(base) || slugify(base) || 'untitled';
      let candidate = root;
      for (const raw of suffixes) {
        if (!has(candidate)) break;
        // A suffix may be free text (a country name), so it is made slug-safe too.
        const suffix = slugify(raw);
        candidate = `${root.slice(0, MAX_LENGTH - suffix.length - 1)}-${suffix}`;
      }
      let n = 2;
      while (has(candidate)) candidate = `${root}-${n++}`;
      used.add(candidate.toLowerCase());
      return { slug: candidate, collided: candidate !== root };
    },
  };
}
