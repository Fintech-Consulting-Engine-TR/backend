import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openapi, healthPaths } from './openapi/document.js';
import { createHealthRouter } from './modules/health/routes.js';

export function createApiRouter(modules = []) {
  const router = Router();
  for (const path of healthPaths) router.use(path.slice('/api'.length), createHealthRouter());
  router.get('/openapi.json', (req, res) => res.json(openapi));
  router.use('/docs', swaggerUi.serve, swaggerUi.setup(null, { swaggerOptions: { url: '/api/openapi.json' } }));
  for (const { path, router: moduleRouter } of modules) {
    if (typeof path !== 'string' || !path.startsWith('/') || typeof moduleRouter !== 'function') {
      throw new TypeError('A module requires an absolute path and an Express router');
    }
    router.use(path, moduleRouter);
  }
  return router;
}
