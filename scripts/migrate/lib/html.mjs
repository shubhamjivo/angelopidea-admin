import { DomUtils, parseDocument } from 'htmlparser2';

const REMOVED = new Set(['script', 'style', 'noscript', 'head', 'title', 'meta', 'link', 'object', 'embed', 'form', 'input']);
/** Presentational wrappers from the old editor; their content is kept, the tag is dropped. */
const UNWRAPPED = new Set(['font', 'span', 'center', 'o:p', 'big', 'small']);
/** Attributes that carry old-site styling rather than content. */
const DROPPED_ATTRIBUTES = /^(style|class|id|lang|dir|align|valign|face|size|color|bgcolor|border|cellpadding|cellspacing|hspace|vspace|on.+)$/i;
const EMBED_CLASSES = /instagram-media|twitter-tweet|twitter-video|fb-post|fb-video|tiktok-embed/;

function textOf(node) {
  if (node.type === 'text') return node.data;
  if (!node.children || REMOVED.has(node.name)) return '';
  return node.children.map(textOf).join('');
}

/** Plain text of an HTML fragment, whitespace collapsed. */
export function htmlToText(html) {
  return textOf(parseDocument(String(html ?? ''), { decodeEntities: true }))
    .replace(/[\s ]+/g, ' ')
    .trim();
}

function findAll(node, name, out = []) {
  for (const child of node.children ?? []) {
    if (child.name === name) out.push(child);
    findAll(child, name, out);
  }
  return out;
}

/** Every `<img src>` in a fragment, in document order. */
export function imageSources(html) {
  return findAll(parseDocument(String(html ?? ''), { decodeEntities: true }), 'img')
    .map((node) => node.attribs.src ?? node.attribs['data-src'] ?? '')
    .filter(Boolean);
}

function youtubeWatchUrl(src) {
  const match = /youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,})/i.exec(src) ?? /youtu\.be\/([\w-]{6,})/i.exec(src);
  return match ? `https://www.youtube.com/watch?v=${match[1]}` : null;
}

/**
 * Cleans legacy CKEditor HTML for the new article body: drops scripts and
 * old-site styling, points images at their new location and reports anything
 * an editor should look at (`flags`).
 *
 * `resolveImage(src)` returns the new URL for an `<img>`, or null to leave the
 * source untouched.
 */
export function cleanBody(html, { resolveImage = () => null } = {}) {
  const flags = new Set();
  let videoUrl = null;

  function clean(node) {
    if (node.type === 'text') return [node];
    if (node.type !== 'tag') return [];
    const { name } = node;
    if (REMOVED.has(name)) return [];

    const isEmbed = name === 'blockquote' && EMBED_CLASSES.test(node.attribs.class ?? '');
    if (isEmbed) flags.add('embed');
    else {
      for (const key of Object.keys(node.attribs)) {
        if (DROPPED_ATTRIBUTES.test(key)) delete node.attribs[key];
      }
    }

    if (name === 'img') {
      const src = node.attribs.src ?? node.attribs['data-src'] ?? '';
      if (!src || src.startsWith('data:')) return [];
      const url = resolveImage(src);
      if (url) node.attribs.src = url;
      else flags.add('unmapped-image');
      delete node.attribs['data-src'];
      delete node.attribs.srcset;
      delete node.attribs.width;
      delete node.attribs.height;
      return [node];
    }

    if (name === 'iframe') {
      const watch = youtubeWatchUrl(node.attribs.src ?? '');
      if (watch) videoUrl ??= watch;
      else flags.add('embed');
      return [node];
    }

    if (name === 'table') flags.add('table');

    node.children = (node.children ?? []).flatMap(clean);
    if (UNWRAPPED.has(name)) return node.children;
    // Paragraphs the old editor left empty (`<p>&nbsp;</p>`) only add stray gaps.
    if ((name === 'p' || name === 'div') && !findAll(node, 'img').length && !findAll(node, 'iframe').length) {
      if (!textOf(node).replace(/&nbsp;|&#160;|\s+/gi, '').replace(/\u00a0/g, '')) return [];
    }
    return [node];
  }

  const document = parseDocument(String(html ?? ''), { decodeEntities: false });
  const nodes = document.children.flatMap(clean);
  const output = nodes.map((node) => DomUtils.getOuterHTML(node, { decodeEntities: false })).join('').trim();
  return { html: output, videoUrl, flags: [...flags], hasText: Boolean(htmlToText(output)) };
}
