import { AppError } from './errors.js';

// Validates req.body/query/params with zod schemas; failures become a 422 response.
export function validate(schemas) {
  return (req, res, next) => {
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue;
      const result = schemas[part].safeParse(req[part]);
      if (!result.success) {
        const details = result.error.issues.map(i => ({ in: part, path: i.path.join('.'), message: i.message }));
        return next(new AppError(422, 'VALIDATION_ERROR', 'Request validation failed', details));
      }
      // req.query is a getter in Express 5, so parsed values are stored separately.
      if (part === 'query') req.validatedQuery = result.data; else req[part] = result.data;
    }
    next();
  };
}
