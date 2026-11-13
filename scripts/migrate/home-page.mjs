// The Home page: files a CMS page at the address `home` with a Hero mosaic section
// (slug `hero-mosaic`) whose four tiles start as the stories tagged Top story 1–4, the
// newest of each, as the homepage shows them now. Desktop and mobile pictures are left
// empty for editors; a tile without one shows its story's own picture. The page is saved
// as a draft, and an existing Home page is left alone so editors' changes survive a re-run.
//
//   npm run migrate:home -- --dry-run
//   npm run migrate:home
import { loadStrapi } from './lib/app.mjs';

const UID = 'api::page.page';
const dryRun = process.argv.includes('--dry-run');

const app = await loadStrapi();
try {
  const existing = await app.documents(UID).findFirst({ filters: { slug: 'home' }, status: 'draft' });
  if (existing) {
    console.log(`Home page already exists (${existing.documentId}); left unchanged.`);
  } else {
    const tiles = [];
    for (const place of [1, 2, 3, 4]) {
      const [story] = await app.documents('api::article.article').findMany({
        filters: { tags: { slug: { $eq: `top-story-${place}` } } },
        sort: ['publishedOn:desc', 'id:desc'],
        fields: ['title'],
        status: 'published',
        limit: 1,
      });
      console.log(`Tile ${place}: ${story?.title ?? '(no story tagged — left empty)'}`);
      tiles.push(story ? { article: story.documentId } : {});
    }
    if (!dryRun) {
      const page = await app.documents(UID).create({
        data: {
          title: 'Home',
          slug: 'home',
          section: [{ __component: 'sections.hero-mosaic', slug: 'hero-mosaic', title: 'Top stories', tiles }],
        },
      });
      console.log(`Created Home page as a draft (${page.documentId}).`);
    }
  }
} finally {
  await app.destroy();
}
