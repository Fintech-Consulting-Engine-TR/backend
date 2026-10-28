export class AppError extends Error {
  // Only deliberate, public-safe messages belong in AppError.
  constructor(status, code, message, details) {
    super(message);
    if (!Number.isInteger(status) || status < 400 || status > 499) {
      throw new TypeError('AppError requires a 4xx status');
    }
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

export function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', 'Route not found'));
}

export function errorHandler(logger) {
  return (err, req, res, next) => {
    if (res.headersSent) {
      // A JSON error can no longer be sent. Do not delegate the original
      // exception to Express's default stderr logger (it may contain secrets).
      logger.error({ requestId: req.requestId, code: 'RESPONSE_ABORTED' }, 'Response aborted');
      return res.destroy();
    }
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details;
    if (err instanceof AppError) {
      ({ status, code, message, details } = err);
    } else if (err?.type === 'entity.parse.failed') {
      status = 400; code = 'INVALID_JSON'; message = 'Request body must be valid JSON';
    } else if (err?.type === 'entity.too.large') {
      status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body exceeds the size limit';
    } else if (['charset.unsupported', 'encoding.unsupported'].includes(err?.type)) {
      status = 415; code = 'UNSUPPORTED_ENCODING'; message = 'Unsupported request encoding';
    } else if (['request.aborted', 'request.size.invalid'].includes(err?.type)) {
      status = 400; code = 'INVALID_REQUEST'; message = 'Invalid request body';
    }
    // Do not log arbitrary error messages, bodies, URLs or headers: they can contain secrets.
    if (status === 500) logger.error({ requestId: req.requestId, code }, 'Request failed');
    res.status(status).json({ error: { code, message, ...(details && { details }), requestId: req.requestId } });
  };
}
