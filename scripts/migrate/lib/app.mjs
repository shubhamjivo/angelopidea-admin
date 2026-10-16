import { createRequire } from 'node:module';

// Strapi's ESM build does not load under plain Node, so use its CommonJS entry.
const { compileStrapi, createStrapi } = createRequire(import.meta.url)('@strapi/strapi');

/** Boots Strapi in-process (no HTTP server) so scripts can use its services. */
export async function loadStrapi() {
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();
  app.log.level = 'warn';
  return app;
}
