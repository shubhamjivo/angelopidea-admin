// Standalone pages: files the old site's Contact Us, Sitemap, Privacy Policy and Terms of Use
// as CMS pages, each split into sections. The text is read from the old site's own page files
// (original-angelopidea/AngelPages/*.aspx). A page that already exists (same web address) is
// left alone, so editors' changes survive a re-run.
//
//   npm run migrate:pages -- --dry-run
//   npm run migrate:pages
import fs from 'node:fs';
import path from 'node:path';
import { loadStrapi } from './lib/app.mjs';
import { cleanBody, htmlToText } from './lib/html.mjs';
import { slugify } from './lib/slug.mjs';

const UID = 'api::page.page';
const SECTION = 'sections.content';
const OLD_PAGES = path.resolve('../original-angelopidea/AngelPages');
const dryRun = process.argv.includes('--dry-run');

/** The markup an old page put in the site's main content area, without its server-side comments. */
function oldContent(file) {
  const source = fs.readFileSync(path.join(OLD_PAGES, file), 'utf8').replace(/<%--[\s\S]*?--%>/g, '');
  const start = source.search(/<asp:Content[^>]*ContentPlaceHolderID="ContentPlaceHolder1"[^>]*>/i);
  const body = source.slice(start).replace(/^<asp:Content[^>]*>/i, '');
  return body.slice(0, body.lastIndexOf('</asp:Content>'));
}

const clean = (html) => cleanBody(html).html;
const section = (slug, title, body) => ({ __component: SECTION, slug, title, body });

/** A policy page: its opening text, then one section per bold heading (`<div class="txtBold">`). */
function policySections(file) {
  const content = oldContent(file).replace(/^[\s\S]*?<h2 class="pageantTitle">[\s\S]*?<\/h2>/i, '');
  const parts = content.split(/<div class="txtBold">([\s\S]*?)<\/div>/i);
  const sections = [];
  const opening = clean(parts[0]);
  if (htmlToText(opening)) sections.push(section('introduction', null, opening));
  const used = new Set(sections.map((item) => item.slug));
  for (let index = 1; index < parts.length; index += 2) {
    const title = htmlToText(parts[index]);
    let slug = slugify(title) || `section-${index}`;
    for (let n = 2; used.has(slug); n += 1) slug = `${slugify(title)}-${n}`;
    used.add(slug);
    sections.push(section(slug, title, clean(parts[index + 1] ?? '')));
  }
  return sections;
}

/** Contact Us: the form (drawn by the website's own form block) and the old page's note on who may write in. */
function contactSections() {
  const content = oldContent('contactUs.aspx');
  const heading = htmlToText(/class="formRightDivHead">([\s\S]*?)<\/div>/i.exec(content)?.[1] ?? '');
  const note = /class="formRightDivBody">([\s\S]*?)<\/div>/i.exec(content)?.[1] ?? '';
  return [
    section('contact-form', 'Contact Us', null),
    section('who-can-contact', heading, clean(note.replace(/<p class="txtBold">([\s\S]*?)<\/p>/gi, '<h3>$1</h3>'))),
  ];
}

const list = (links) => `<ul>${links.map(([label, href]) => `<li><a href="${href}">${label}</a></li>`).join('')}</ul>`;

/**
 * The old sitemap, group by group, with links to the pages' new addresses. Its two lists that
 * came from the database (international pageants, countries and their pageants) are sections
 * the website fills from the CMS, so they stay current.
 */
function sitemapSections() {
  return [
    section('home', 'Home', list([['Home', '/']])),
    section(
      'news',
      'News',
      list([
        ['News', '/news'],
        ['Opinions', '/news/opinions'],
        ['Beauty Talks', '/news/beauty-talks'],
        ['Featured', '/news/featured'],
        ['Specials', '/news/specials'],
        ['News In Pictures', '/news/in-pictures'],
      ]),
    ),
    section(
      'big-4-pageants',
      'Big 4 Pageants',
      list([
        ['Miss World', '/miss-world'],
        ['Miss Universe', '/miss-universe'],
        ['Miss Earth', '/miss-earth'],
        ['Miss International', '/miss-international'],
      ]),
    ),
    section('sitemap-international-pageants', 'Other International Pageants', null),
    section(
      'pageants-by-continent',
      'Pageants By Continent',
      list([
        ['Asia', '/pageants/asia'],
        ['South America', '/pageants/south-america'],
        ['North America', '/pageants/north-america'],
        ['Europe', '/pageants/europe'],
        ['Africa', '/pageants/africa'],
        ['Oceania', '/pageants/oceania'],
      ]),
    ),
    section('sitemap-country-pageants', 'Pageants By Country', null),
    section('play-zone', 'Play Zone', list([['Prediction Game', '/Prediction-Game-for-Beauty-Pageants'], ['Polls', '/Polls']])),
    section(
      'angelopedia',
      'Angelopedia',
      list([['Contact Us', '/Contact-Us'], ['Privacy Policy', '/Privacy'], ['Terms & Conditions', '/Terms-of-use']]),
    ),
  ];
}

// Titles and web addresses as the old site had them (Web.config urlMappings).
const PAGES = [
  { title: 'Contact Us', slug: 'Contact-Us', sections: contactSections },
  { title: 'Angelopedia Sitemap', slug: 'Sitemap', sections: sitemapSections },
  { title: 'Privacy Policy', slug: 'Privacy', sections: () => policySections('privacy.aspx') },
  { title: 'Terms & Conditions', slug: 'Terms-of-use', sections: () => policySections('TermAndCondition.aspx') },
];

const strapi = await loadStrapi();
const stats = { read: PAGES.length, created: 0, existing: 0, failed: 0, sections: {} };
try {
  const documents = strapi.documents(UID);
  for (const page of PAGES) {
    try {
      const sections = page.sections();
      stats.sections[page.slug] = sections.map((item) => item.slug);
      const [found] = dryRun ? [] : await documents.findMany({ filters: { slug: page.slug }, status: 'draft', limit: 1 });
      if (found) {
        stats.existing += 1;
        continue;
      }
      if (!dryRun) await documents.create({ status: 'published', data: { title: page.title, slug: page.slug, section: sections } });
      stats.created += 1;
    } catch (error) {
      stats.failed += 1;
      console.error(`${page.slug}: ${error.message}`, error?.details?.errors ?? '');
    }
  }
  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'write', ...stats }, null, 2));
} finally {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await strapi.destroy().catch((error) => console.warn(`Strapi shutdown: ${error.message}`));
}
process.exit(0);
