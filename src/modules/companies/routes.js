import { Router } from 'express';
import { validate } from '../../http/validate.js';
import { idParams, listQuery } from '../shared.js';
import { createCompany, updateCompany, companyQuery } from './schemas.js';
import { createCompanyService } from './service.js';
import { createCompanyController } from './controller.js';

export function createCompanyRouter(db, contactController) {
  const router = Router();
  const controller = createCompanyController(createCompanyService(db));
  router.post('/', validate({ body: createCompany }), controller.create);
  router.get('/', validate({ query: companyQuery }), controller.list);
  router.get('/:id/contacts', validate({ params: idParams, query: listQuery }), contactController.listForCompany);
  router.get('/:id', validate({ params: idParams }), controller.get);
  router.patch('/:id', validate({ params: idParams, body: updateCompany }), controller.update);
  router.delete('/:id', validate({ params: idParams }), controller.remove);
  return router;
}
