import { Router } from 'express';
import { validate } from '../../http/validate.js';
import { idParams, listQuery } from '../shared.js';
import { createContact, updateContact } from './schemas.js';

export function createContactRouter(controller) {
  const router = Router();
  router.post('/', validate({ body: createContact }), controller.create);
  router.get('/', validate({ query: listQuery }), controller.list);
  router.get('/:id', validate({ params: idParams }), controller.get);
  router.patch('/:id', validate({ params: idParams, body: updateContact }), controller.update);
  router.delete('/:id', validate({ params: idParams }), controller.remove);
  return router;
}
