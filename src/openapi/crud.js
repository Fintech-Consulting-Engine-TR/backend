import { z } from 'zod';
import { createCompany, updateCompany } from '../modules/companies/schemas.js';
import { createContact, updateContact } from '../modules/contacts/schemas.js';

const ref = name => ({ $ref: `#/components/schemas/${name}` });
const uuid = { type: 'string', format: 'uuid' };
const nullableId = { ...uuid, nullable: true };
const user = { type: 'object', nullable: true, required: ['id', 'email'], properties: { id: uuid, email: { type: 'string' } } };
const recordFields = {
  id: uuid, createdById: { ...nullableId, readOnly: true, description: 'Server-owned; set from the authenticated user for new records; null for legacy records. Rejected in request bodies.' },
  responsibleUserId: nullableId, createdBy: user, responsibleUser: user,
  createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
};
const toSchema = schema => z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' });
export const crudSchemas = {
  CreateCompany: toSchema(createCompany),
  UpdateCompany: { ...toSchema(updateCompany), minProperties: 1 },
  CreateContact: toSchema(createContact),
  UpdateContact: { ...toSchema(updateContact), minProperties: 1 },
  Company: {
    type: 'object', required: [...Object.keys(recordFields), 'name'],
    properties: { ...recordFields, name: { type: 'string' }, industry: { type: 'string', nullable: true }, website: { type: 'string', nullable: true }, custom: { type: 'object', additionalProperties: true } },
  },
  Contact: {
    type: 'object', required: [...Object.keys(recordFields), 'firstName', 'lastName', 'email', 'phone', 'companyId', 'company'],
    properties: {
      ...recordFields, firstName: { type: 'string', nullable: true }, lastName: { type: 'string', nullable: true },
      full_name: { type: 'string' }, position: { type: 'string', nullable: true }, custom: { type: 'object', additionalProperties: true },
      email: { type: 'string', format: 'email', nullable: true, description: 'Trimmed, lowercase, globally unique when non-null.' },
      phone: { type: 'string', nullable: true }, companyId: uuid,
      company: { type: 'object', required: ['id', 'name'], properties: { id: uuid, name: { type: 'string' } } },
    },
  },
};
const errors = Object.fromEntries([
  [400, 'Malformed JSON'], [401, 'Authentication required'], [403, 'Origin denied'], [404, 'Record or company not found'],
  [409, 'Duplicate email or foreign-key conflict; companies with contacts cannot be deleted'],
  [413, 'Payload too large'], [422, 'Invalid request or responsible user does not exist'], [500, 'Internal server error'],
].map(([code, description]) => [code, { description, content: { 'application/json': { schema: ref('Error') } } }]));
const idParameter = { name: 'id', in: 'path', required: true, schema: uuid };
const pagination = [
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
  { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, maximum: 2147483647, default: 0 } },
];
const result = (name, array = false) => ({
  description: 'Success', content: { 'application/json': { schema: {
    type: 'object', required: ['data'], properties: { data: array ? { type: 'array', items: ref(name) } : ref(name) },
  } } },
});
function operation(summary, name, { status = 200, array = false, parameters = [], body } = {}) {
  return {
    summary, parameters, security: [{ bearerAuth: [] }],
    ...(body && { requestBody: { required: true, content: { 'application/json': { schema: ref(body) } } } }),
    responses: { ...errors, [status]: status === 204 ? { description: 'Deleted; no response body' } : result(name, array) },
  };
}
export const crudPaths = {};
for (const [plural, name] of [['companies', 'Company'], ['contacts', 'Contact']]) {
  crudPaths[`/api/v1/${plural}`] = {
    post: operation(`Create ${name}; createdById is server-owned`, name, { status: 201, body: `Create${name}` }),
    get: operation(`List ${plural} in stable creation order; use limit/offset for all pages`, name, {
      array: true, parameters: [...pagination, ...(name === 'Company' ? [{ name: 'search', in: 'query', schema: { type: 'string', maxLength: 255 }, description: 'Case-insensitive name substring' }] : [])],
    }),
  };
  crudPaths[`/api/v1/${plural}/{id}`] = {
    get: operation(`Get ${name}`, name, { parameters: [idParameter] }),
    patch: operation(`Update ${name}; omit unchanged fields, null clears optional fields`, name, { parameters: [idParameter], body: `Update${name}` }),
    delete: operation(`Delete ${name}${name === 'Company' ? ' (409 if contacts exist)' : ''}`, name, { parameters: [idParameter], status: 204 }),
  };
}
crudPaths['/api/v1/companies/{id}/contacts'] = {
  get: operation('List company contacts; 404 if company does not exist', 'Contact', { array: true, parameters: [idParameter, ...pagination] }),
};
