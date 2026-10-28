import 'dotenv/config';
import { createDatabase } from '../src/database/client.js';
import { loadConfig } from '../src/config/env.js';

let database;
try {
  const config = loadConfig();
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required');
  database = createDatabase(config.databaseUrl);
  await database.connect();
  console.log('PostgreSQL connection OK');
} catch {
  console.error('Database connection failed. Check DATABASE_URL and PostgreSQL availability.');
  process.exitCode = 1;
} finally {
  await database?.disconnect();
}
