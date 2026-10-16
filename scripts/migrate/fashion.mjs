// Fashion and Beauty: files the looks that were built into the site (data/fashion-looks.json)
// as CMS entries. Their pictures are the site's own files, copied to public/uploads/fashion/.
// An entry that already exists (same web address) is left alone, so editors' changes survive a re-run.
//
//   npm run migrate:fashion -- --dry-run
//   npm run migrate:fashion
import fs from 'node:fs';
import path from 'node:path';
import { loadStrapi } from './lib/app.mjs';
import { createMediaRegistry } from './lib/media.mjs';

const UID = 'api::fashion-look.fashion-look';
const dryRun = process.argv.includes('--dry-run');
const looks = JSON.parse(fs.readFileSync(new URL('./data/fashion-looks.json', import.meta.url), 'utf8'));
const escape = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const strapi = await loadStrapi();
const stats = { read: looks.length, created: 0, existing: 0, failed: 0 };
try {
  const media = await createMediaRegistry(strapi, { dryRun });
  const documents = strapi.documents(UID);
  for (const [index, look] of looks.entries()) {
    try {
      const [found] = dryRun ? [] : await documents.findMany({ filters: { slug: look.slug }, status: 'draft', limit: 1 });
      if (found) {
        stats.existing += 1;
        continue;
      }
      // The built-in data named the pageant by its page ("/miss-world"); that is the pageant's slug.
      const [pageant] = await strapi.documents('api::pageant.pageant').findMany({
        filters: { slug: look.pageantHref.replace(/^\//, '') },
        limit: 1,
      });
      const image = await media.ensureFile('fashion', path.basename(look.image), { alternativeText: look.alt });
      if (!dryRun) {
        await documents.create({
          status: 'published',
          data: {
            title: look.dress,
            slug: look.slug,
            wornBy: look.name,
            designer: look.designer,
            pageant: pageant?.documentId ?? null,
            dek: look.dek,
            image: image?.id ?? null,
            imageAlt: look.alt,
            credit: look.credit,
            body: look.paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`).join('\n'),
            order: index + 1,
          },
        });
      }
      stats.created += 1;
    } catch (error) {
      stats.failed += 1;
      console.error(`${look.slug}: ${error.message}`);
    }
  }
  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'write', ...stats }, null, 2));
} finally {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await strapi.destroy().catch((error) => console.warn(`Strapi shutdown: ${error.message}`));
}
process.exit(0);
