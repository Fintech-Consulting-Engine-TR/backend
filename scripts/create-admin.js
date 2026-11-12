import 'dotenv/config';
import { createDatabase } from '../src/database/client.js';
import { hashPassword } from '../src/modules/auth/password.js';

// Creates the first admin (or promotes an existing user and resets the password).
// Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run admin:create
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!process.env.DATABASE_URL || !email || !password || password.length < 8 || password === 'CHANGE_ME') {
  console.error('Set DATABASE_URL, ADMIN_EMAIL and ADMIN_PASSWORD (at least 8 characters, not CHANGE_ME).');
  process.exit(1);
}

const database = createDatabase(process.env.DATABASE_URL);
try {
  await database.connect();
  const password_hash = hashPassword(password);
  await database.client.user.upsert({
    where: { email },
    update: { role: 'admin', password_hash },
    create: { email, role: 'admin', password_hash },
  });
  console.log(`Admin ready: ${email}`);
} catch {
  console.error('Failed to create admin. Check the database connection and that migrations are applied.');
  process.exitCode = 1;
} finally {
  await database.disconnect();
}
