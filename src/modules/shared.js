import { z } from 'zod';
import { AppError } from '../http/errors.js';

export const idParams = z.strictObject({ id: z.uuid() });
export const userId = z.uuid().nullable().optional();
export const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(2147483647).default(0),
};
export const listQuery = z.strictObject(pagination);
export const ownership = {
  createdBy: { select: { id: true, email: true } },
  responsibleUser: { select: { id: true, email: true } },
};

// Shared by records now; future comments/tasks can reuse this policy.
// createdById is never accepted from request bodies. Auth must supply it later.
export async function requireResponsibleUser(db, id) {
  if (id && !await db.user.findUnique({ where: { id }, select: { id: true } })) {
    throw new AppError(422, 'INVALID_RESPONSIBLE_USER', 'Responsible user does not exist');
  }
}

export async function requireCompany(db, id) {
  const company = await db.company.findUnique({ where: { id }, select: { id: true } });
  if (!company) throw new AppError(404, 'COMPANY_NOT_FOUND', 'Company not found');
}
