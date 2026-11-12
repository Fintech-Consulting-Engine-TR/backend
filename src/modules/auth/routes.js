import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../http/errors.js';
import { validate } from '../../http/validate.js';
import { authenticate, signToken } from './middleware.js';
import { hashPassword, verifyPassword } from './password.js';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1) });
// Used when the email is unknown, so both failures take the same time.
const dummyHash = hashPassword('not-a-real-password');

export const publicUser = ({ id, email, role, created_at }) => ({ id, email, role, created_at });

export function createAuthRouter({ prisma, config }) {
  const router = Router();

  router.post('/login', validate({ body: loginSchema }), async (req, res) => {
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    const valid = verifyPassword(req.body.password, user?.password_hash ?? dummyHash);
    if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    res.json({ data: { token: signToken(user, config.jwtSecret), user: publicUser(user) } });
  });

  router.get('/me', authenticate({ prisma, config }), (req, res) => {
    res.json({ data: req.user });
  });

  return router;
}
