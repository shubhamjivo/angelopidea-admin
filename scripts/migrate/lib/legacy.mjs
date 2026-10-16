import pg from 'pg';

/**
 * Read-only pool for the legacy database. Every session is forced read-only,
 * so a mistake here cannot change the source data.
 */
export function createLegacyPool() {
  const base = process.env.LEGACY_DATABASE_URL
    ? { connectionString: process.env.LEGACY_DATABASE_URL }
    : {
        host: process.env.DATABASE_HOST ?? '127.0.0.1',
        port: Number(process.env.DATABASE_PORT ?? 5432),
        user: process.env.DATABASE_USERNAME,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.LEGACY_DATABASE_NAME ?? 'angelopedia_original_database',
      };
  return new pg.Pool({ ...base, max: 2, options: '-c default_transaction_read_only=on' });
}
