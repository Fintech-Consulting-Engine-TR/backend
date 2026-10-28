const levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'];

function integer(value, fallback, name, min, max) {
  const raw = value ?? String(fallback);
  if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) {
    throw new Error(`Invalid ${name}`);
  }
  return Number(raw);
}

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) throw new Error('Invalid NODE_ENV');
  const logLevel = env.LOG_LEVEL ?? 'info';
  if (!levels.includes(logLevel)) throw new Error('Invalid LOG_LEVEL');
  const host = env.HOST ?? '127.0.0.1';
  if (!host.trim() || /\s/.test(host)) throw new Error('Invalid HOST');
  const corsOrigins = [...new Set((env.CORS_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean))];
  for (const origin of corsOrigins) {
    let url;
    try { url = new URL(origin); } catch { throw new Error('Invalid CORS_ORIGINS'); }
    const isWeb = ['http:', 'https:'].includes(url.protocol) && url.origin === origin;
    const isExtension = /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
    if (!isWeb && !isExtension) throw new Error('Invalid CORS_ORIGINS');
  }
  const databaseUrl = env.DATABASE_URL || undefined;
  if (databaseUrl) {
    let url;
    try { url = new URL(databaseUrl); } catch { throw new Error('Invalid DATABASE_URL'); }
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) {
      throw new Error('Invalid DATABASE_URL');
    }
  }
  return Object.freeze({
    databaseUrl, nodeEnv, host, logLevel, corsOrigins: Object.freeze(corsOrigins),
    port: integer(env.PORT, 3000, 'PORT', 0, 65535),
    shutdownTimeoutMs: integer(env.SHUTDOWN_TIMEOUT_MS, 10000, 'SHUTDOWN_TIMEOUT_MS', 1, 120000),
  });
}
