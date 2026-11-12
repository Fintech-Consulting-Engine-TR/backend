import { z } from 'zod';
import { userId } from '../shared.js';

export const createContact = z.strictObject({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().max(254).email().nullable().optional(),
  phone: z.string().trim().min(1).max(50).nullable().optional(),
  companyId: z.uuid(),
  responsibleUserId: userId,
});
export const updateContact = createContact.partial().refine(data => Object.keys(data).length > 0, 'At least one field is required');
