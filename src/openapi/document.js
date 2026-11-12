const errorResponse = description => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});
const bearer = [{ bearerAuth: [] }];
const role = { type: 'string', enum: ['admin', 'user'] };
export const healthPaths = ['/api/health', '/api/v1/health'];
export const openapi = {
  openapi: '3.0.3',
  info: { title: 'Fintech Consulting Engine API', version: '1.0.0' },
  paths: {
    ...Object.fromEntries(healthPaths.map(path => [path, {
    get: {
      summary: 'Process liveness (does not check database readiness)',
      operationId: path.includes('/v1/') ? 'healthV1' : 'healthLegacy',
      responses: {
        200: {
          description: 'Process is running',
          headers: { 'X-Request-Id': { schema: { type: 'string', format: 'uuid' } } },
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' } } },
        },
        403: errorResponse('Origin is not allowed'),
        500: errorResponse('Unexpected internal error'),
      },
    },
  }])),
    '/api/v1/auth/login': {
      post: {
        summary: 'Log in and get a JWT',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Credentials' } } } },
        responses: {
          200: { description: 'Token and user', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResult' } } } },
          401: errorResponse('Invalid email or password'),
          422: errorResponse('Validation failed'),
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        summary: 'Current user', security: bearer,
        responses: { 200: { description: 'Current user' }, 401: errorResponse('Not authenticated') },
      },
    },
    '/api/v1/users': {
      get: {
        summary: 'List users (admin only)', security: bearer,
        responses: { 200: { description: 'Users' }, 401: errorResponse('Not authenticated'), 403: errorResponse('Not an admin') },
      },
      post: {
        summary: 'Create a user with a role (admin only)', security: bearer,
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NewUser' } } } },
        responses: {
          201: { description: 'Created user' }, 401: errorResponse('Not authenticated'), 403: errorResponse('Not an admin'),
          409: errorResponse('Email already exists'), 422: errorResponse('Validation failed'),
        },
      },
    },
    '/api/v1/users/{id}/role': {
      patch: {
        summary: 'Change a user role (admin only)', security: bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['role'], properties: { role } } } } },
        responses: {
          200: { description: 'Updated user' }, 401: errorResponse('Not authenticated'), 403: errorResponse('Not an admin'),
          404: errorResponse('User not found'), 409: errorResponse('Cannot change own role'), 422: errorResponse('Validation failed'),
        },
      },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
    Credentials: {
      type: 'object', required: ['email', 'password'],
      properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
    },
    NewUser: {
      type: 'object', required: ['email', 'password'],
      properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 }, role },
    },
    LoginResult: {
      type: 'object', properties: { data: { type: 'object', properties: { token: { type: 'string' }, user: { type: 'object' } } } },
    },
    Health: {
      type: 'object', required: ['data'], properties: { data: {
        type: 'object', required: ['status', 'uptimeSeconds', 'timestamp'],
        properties: {
          status: { type: 'string', enum: ['ok'] },
          uptimeSeconds: { type: 'number', minimum: 0 },
          timestamp: { type: 'string', format: 'date-time' },
        },
      } },
    },
    Error: {
      type: 'object', required: ['error'], properties: { error: {
        type: 'object', required: ['code', 'message', 'requestId'],
        properties: { code: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string', format: 'uuid' } },
      } },
    },
  } },
};
