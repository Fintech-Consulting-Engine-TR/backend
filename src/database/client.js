import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// One client/pool per application lifecycle, never one per HTTP request.
export function createDatabase(databaseUrl) {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: 5000,
  });
  const client = new PrismaClient({ adapter, log: [] });
  return {
    client,
    async connect() {
      try {
        await client.$connect();
        await client.$queryRaw`SELECT 1`;
      } catch {
        await client.$disconnect().catch(() => {});
        throw new Error('Database connection failed. Check DATABASE_URL and PostgreSQL availability.');
      }
    },
    async disconnect() { await client.$disconnect(); },
  };
}
