import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../http/errors.js';
import { validate } from '../../http/validate.js';
import { authenticate, requireRole } from '../auth/middleware.js';
import { hashPassword } from '../auth/password.js';
import { emailSchema, publicUser } from '../auth/routes.js';

const roleSchema = z.enum(['admin', 'user']);
const createSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(128),
  role: roleSchema.default('user'),
});
const idSchema = z.object({ id: z.uuid() });

// Every route here is admin-only: no token gives 401, a non-admin gives 403.
export function createUsersRouter({ prisma, config }) {
  const router = Router();
  router.use(authenticate({ prisma, config }), requireRole('admin'));

  router.get('/', async (req, res) => {
    const users = await prisma.user.findMany({ orderBy: { created_at: 'asc' } });
    res.json({ data: users.map(publicUser) });
  });

  router.post('/', validate({ body: createSchema }), async (req, res) => {
    const { email, password, role } = req.body;
    try {
      const user = await prisma.user.create({ data: { email, role, password_hash: hashPassword(password) } });
      res.status(201).json({ data: publicUser(user) });
    } catch (error) {
      if (error.code === 'P2002') throw new AppError(409, 'EMAIL_TAKEN', 'User with this email already exists');
      throw error;
    }
  });

  router.patch('/:id/role', validate({ params: idSchema, body: z.object({ role: roleSchema }) }), async (req, res) => {
    if (req.params.id === req.user.id) throw new AppError(409, 'CANNOT_CHANGE_OWN_ROLE', 'You cannot change your own role');
    try {
      const user = await prisma.user.update({ where: { id: req.params.id }, data: { role: req.body.role } });
      res.json({ data: publicUser(user) });
    } catch (error) {
      if (error.code === 'P2025') throw new AppError(404, 'NOT_FOUND', 'User not found');
      throw error;
    }
  });

  return router;
}
