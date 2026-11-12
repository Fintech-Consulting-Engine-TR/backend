import { z } from 'zod';
import { pagination, userId } from '../shared.js';

export const createCompany = z.strictObject({
  name: z.string().trim().min(1).max(255),
  industry: z.string().trim().max(255).nullable().optional(),
  website: z.url().nullable().optional(),
  custom: z.record(z.string(), z.json()).optional(),
  responsibleUserId: userId,
});
export const updateCompany = createCompany.partial().refine(data => Object.keys(data).length > 0, 'At least one field is required');
export const companyQuery = z.strictObject({
  ...pagination,
  search: z.string().trim().max(255).optional(),
});
