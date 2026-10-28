const errorResponse = description => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});
export const healthPaths = ['/api/health', '/api/v1/health'];
export const openapi = {
  openapi: '3.0.3',
  info: { title: 'Fintech Consulting Engine API', version: '1.0.0' },
  paths: Object.fromEntries(healthPaths.map(path => [path, {
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
  components: { schemas: {
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
