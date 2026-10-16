// After the legacy image folders have been copied into public/uploads/, this
// fills in each registered image's real width, height and file size, and lists
// the files that are still missing. It only reads files; it never downloads.
//
//   npm run migrate:media
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadStrapi } from './lib/app.mjs';

const sharp = createRequire(import.meta.url)('sharp');
const FILE_UID = 'plugin::upload.file';

const strapi = await loadStrapi();
try {
  const uploads = path.join(strapi.dirs.static.public, 'uploads');
  const files = await strapi.db.query(FILE_UID).findMany({ where: { provider: 'local' } });
  const stats = { registered: files.length, found: 0, updated: 0, missing: 0, unreadable: 0 };
  const missing = [];

  for (const file of files) {
    const relative = `${file.hash}${file.ext}`;
    const absolute = path.join(uploads, relative);
    if (!fs.existsSync(absolute)) {
      stats.missing += 1;
      missing.push(relative);
      continue;
    }
    stats.found += 1;
    if (file.width && file.height && Number(file.size) > 0) continue;
    try {
      const { width, height } = await sharp(absolute).metadata();
      const size = Math.round((fs.statSync(absolute).size / 1024) * 100) / 100;
      await strapi.db.query(FILE_UID).update({ where: { id: file.id }, data: { width, height, size } });
      stats.updated += 1;
    } catch {
      stats.unreadable += 1;
      missing.push(`${relative} (unreadable)`);
    }
  }

  const outDir = path.resolve('migration-output');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'media-missing.txt'), `${missing.join('\n')}\n`);
  console.log(JSON.stringify({ uploads, ...stats }, null, 2));
} finally {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await strapi.destroy().catch((error) => console.warn(`Strapi shutdown: ${error.message}`));
}
process.exit(0);
