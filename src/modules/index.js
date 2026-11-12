import { createAuthRouter } from './auth/routes.js';
import { createUsersRouter } from './users/routes.js';

// Modules that need the database. Without DATABASE_URL the API runs HTTP-only.
export function createModules({ prisma, config }) {
  return [
    { path: '/v1/auth', router: createAuthRouter({ prisma, config }) },
    { path: '/v1/users', router: createUsersRouter({ prisma, config }) },
  ];
}
