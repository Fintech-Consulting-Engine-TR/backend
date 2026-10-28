import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { createApiRouter } from './routes.js';
import { AppError, notFound, errorHandler } from './http/errors.js';
import { requestContext } from './http/request-context.js';

// Construction has no listening, dotenv or process-signal side effects.
export function createApp({ config, logger, modules = [] }) {
  const app = express();
  app.set('env', config.nodeEnv);
  app.disable('x-powered-by');
  app.use(requestContext(logger));
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      callback(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'Origin is not allowed'));
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-Id'],
    credentials: false,
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', createApiRouter(modules));
  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
