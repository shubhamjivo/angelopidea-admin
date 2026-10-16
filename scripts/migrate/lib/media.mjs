import path from 'node:path';

const FILE_UID = 'plugin::upload.file';
const FOLDER_UID = 'plugin::upload.folder';
const ROOT_FOLDER = 'Legacy site';

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
};

/**
 * Registers legacy images in the Media Library **by path only**. No file is
 * read, copied or downloaded: a record for `newspic/abc.jpg` points at
 * `/uploads/newspic/abc.jpg`, and the image appears once that file is placed
 * in `public/uploads/newspic/`. Width, height and size stay empty until
 * `sync-media` reads the real files.
 */
export async function createMediaRegistry(strapi, { dryRun = false } = {}) {
  const byUrl = new Map();
  const folders = new Map();
  const stats = { created: 0, reused: 0, skipped: 0 };

  if (!dryRun) {
    const existing = await strapi.db.query(FILE_UID).findMany({ where: { provider: 'local' } });
    for (const file of existing) byUrl.set(file.url, file);
  }

  async function ensureFolder(name, parent = null) {
    const key = `${parent?.id ?? 0}/${name}`;
    if (folders.has(key)) return folders.get(key);
    const candidates = await strapi.db
      .query(FOLDER_UID)
      .findMany({ where: { name }, populate: { parent: true } });
    let folder = candidates.find((item) => (item.parent?.id ?? null) === (parent?.id ?? null));
    if (!folder) {
      folder = await strapi
        .plugin('upload')
        .service('folder')
        .create({ name, parent: parent?.id ?? null });
    }
    folders.set(key, folder);
    return folder;
  }

  /** `legacyDir` is the folder under the old site root, e.g. `newspic`. */
  async function ensureFile(legacyDir, fileName, { alternativeText = null, caption = null } = {}) {
    const ext = path.extname(fileName);
    const mime = MIME[ext.toLowerCase()];
    if (!fileName || !mime) {
      stats.skipped += 1;
      return null;
    }
    const url = `/uploads/${legacyDir}/${encodeURIComponent(fileName)}`;
    const known = byUrl.get(url);
    if (known) {
      stats.reused += 1;
      return known;
    }
    const data = {
      name: fileName,
      alternativeText,
      caption,
      hash: `${legacyDir}/${path.basename(fileName, ext)}`,
      ext,
      mime,
      size: 0,
      url,
      provider: 'local',
    };
    let file;
    if (dryRun) {
      file = { id: 0, ...data, createdAt: new Date(0), updatedAt: new Date(0) };
    } else {
      // A nested legacy folder (`NewsInPic/Thumb`) becomes nested Media Library folders.
      let folder = await ensureFolder(ROOT_FOLDER);
      for (const name of legacyDir.split('/')) folder = await ensureFolder(name, folder);
      file = await strapi.db
        .query(FILE_UID)
        .create({ data: { ...data, folder: folder.id, folderPath: folder.path } });
    }
    byUrl.set(url, file);
    stats.created += 1;
    return file;
  }

  return { ensureFile, stats };
}
