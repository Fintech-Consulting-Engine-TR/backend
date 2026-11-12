import { authenticate } from './modules/auth/middleware.js';
import { createCompanyRouter } from './modules/companies/routes.js';
import { createContactRouter } from './modules/contacts/routes.js';
import { createContactController } from './modules/contacts/controller.js';
import { createContactService } from './modules/contacts/service.js';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openapi, healthPaths } from './openapi/document.js';
import { createHealthRouter } from './modules/health/routes.js';

export function createApiRouter(modules = [], db, config) {
  const router = Router();
  for (const path of healthPaths) router.use(path.slice('/api'.length), createHealthRouter());
  router.get('/openapi.json', (req, res) => res.json(openapi));
  router.use('/docs', swaggerUi.serve, swaggerUi.setup(null, { swaggerOptions: { url: '/api/openapi.json' } }));
  const contacts = createContactController(createContactService(db));
  // HTTP-only mode preserves health/docs but cannot serve persisted resources.
  router.use(['/v1/companies', '/v1/contacts'], (req, res, next) => {
    if (!db) return next(new Error('Database is not configured'));
    next();
  });
  router.use(['/v1/companies', '/v1/contacts'], authenticate({ prisma: db, config }));
  router.use('/v1/companies', createCompanyRouter(db, contacts));
  router.use('/v1/contacts', createContactRouter(contacts));
  for (const { path, router: moduleRouter } of modules) {
    if (typeof path !== 'string' || !path.startsWith('/') || typeof moduleRouter !== 'function') {
      throw new TypeError('A module requires an absolute path and an Express router');
    }
    router.use(path, moduleRouter);
  }
  return router;
}
