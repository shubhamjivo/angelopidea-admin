import { useEffect } from 'react';
import { unstable_useContentManagerContext, useFetchClient, useForm } from '@strapi/strapi/admin';

/**
 * The edition picker offers only editions of the pageants chosen beside it.
 *
 * The picker's search request (`/content-manager/relations/<model>/<editions field>`)
 * passes any `filters` through to the database query, so the admin only has to add
 * the chosen pageants to it. `EditionFilter` keeps track of them on the edit page;
 * `installEditionFilter` adds them to the request.
 */

/** Per content type: the edition field and the pageant field it follows. */
const PAIRS: Record<string, { editions: string; pageants: string }> = {
  'api::article.article': { editions: 'editions', pageants: 'pageants' },
  'api::photo-story.photo-story': { editions: 'editions', pageants: 'pageants' },
  'api::video.video': { editions: 'edition', pageants: 'pageant' },
  'api::gallery-photo.gallery-photo': { editions: 'edition', pageants: 'pageant' },
  'api::prediction-game.prediction-game': { editions: 'edition', pageants: 'pageant' },
};

type Relation = { documentId?: string; apiData?: { documentId?: string } };

/** Picks and removals made before saving keep the documentId under `apiData`. */
const documentIdOf = (item: Relation) => item.documentId ?? item.apiData?.documentId ?? '';
type RelationValue = { connect?: Relation[]; disconnect?: Relation[] } | undefined;

/** Pageants chosen on the open edit page, by content type (documentIds). */
const chosen = new Map<string, string[]>();

export function EditionFilter() {
  const { model, id } = unstable_useContentManagerContext();
  const pair = PAIRS[model];
  const value = useForm(
    'EditionFilter',
    (state) => (pair ? ((state.values as Record<string, unknown>)[pair.pageants] as RelationValue) : undefined),
    false
  );
  const { get } = useFetchClient();
  // Re-read whenever the pageant field changes, which also covers a save turning picks into saved links.
  const changes = JSON.stringify(value ?? null);

  useEffect(() => {
    if (!pair) return;
    let current = true;
    const update = async () => {
      let saved: string[] = [];
      if (id && id !== 'create') {
        const { data } = await get<{ results?: Relation[] }>(
          `/content-manager/relations/${model}/${id}/${pair.pageants}`,
          { params: { pageSize: 100 } }
        ).catch(() => ({ data: {} as { results?: Relation[] } }));
        saved = (data.results ?? []).map(documentIdOf);
      }
      const removed = new Set((value?.disconnect ?? []).map(documentIdOf));
      const added = (value?.connect ?? []).map(documentIdOf);
      const ids = [...new Set([...saved, ...added])].filter((item) => item && !removed.has(item));
      if (current) chosen.set(model, ids);
    };
    update();
    return () => {
      current = false;
    };
  }, [model, id, changes]);

  // Leaving the page forgets its pageants.
  useEffect(() => () => void chosen.delete(model), [model]);

  return null;
}

/** Adds the chosen pageants to the edition picker's search requests. */
export function installEditionFilter() {
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, window.location.origin);
    const match = /\/content-manager\/relations\/([^/]+)\/([^/]+)$/.exec(url.pathname);
    const pair = match && PAIRS[decodeURIComponent(match[1])];
    const ids = match ? chosen.get(decodeURIComponent(match[1])) : undefined;
    if (!pair || pair.editions !== match[2] || !ids?.length) return original(input, init);
    ids.forEach((documentId, index) =>
      url.searchParams.set(`filters[pageant][documentId][$in][${index}]`, documentId)
    );
    return original(input instanceof Request ? new Request(url, input) : url.toString(), init);
  };
}
