import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export function requestContext(logger) {
  return (req, res, next) => {
    req.requestId = randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    const started = performance.now();
    res.on('finish', () => {
      logger.info({
        requestId: req.requestId,
        method: req.method,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - started),
      }, 'Request completed');
    });
    next();
  };
}
