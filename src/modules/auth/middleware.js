import jwt from 'jsonwebtoken';
import { AppError } from '../../http/errors.js';

export function signToken(user, secret) {
  return jwt.sign({ sub: user.id }, secret, { algorithm: 'HS256', expiresIn: '8h' });
}

// Reads the Bearer token and loads the user from the database on every request,
// so a changed role or a deleted user takes effect immediately.
export function authenticate({ prisma, config }) {
  return async (req, res, next) => {
    try {
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (!token) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      let payload;
      try {
        payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
      } catch {
        throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token');
      }
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token');
      req.user = { id: user.id, email: user.email, role: user.role };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) return next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions'));
    next();
  };
}
