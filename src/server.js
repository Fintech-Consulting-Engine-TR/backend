import 'dotenv/config';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config/env.js';
import { createLogger } from './logger.js';
import { createApp } from './app.js';
import { createDatabase } from './database/client.js';

export async function startServer({ config = loadConfig(), logger = createLogger(config) } = {}) {
  const database = config.databaseUrl ? createDatabase(config.databaseUrl) : undefined;
  await database?.connect();
  const server = createServer(createApp({ config, logger }));
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.keepAliveTimeout = 5000;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
  } catch (error) {
    await database?.disconnect();
    throw error;
  }
  logger.info({ address: server.address() }, 'Server listening');
  let closing;
  const stop = () => {
    if (closing) return closing;
    closing = new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        logger.warn('Shutdown deadline exceeded; closing active connections');
        server.closeAllConnections();
      }, config.shutdownTimeoutMs);
      deadline.unref();
      server.close(err => {
        clearTimeout(deadline);
        if (err) reject(err); else resolve();
      });
    }).finally(() => database?.disconnect());
    return closing;
  };
  return { server, stop };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = loadConfig();
    const logger = createLogger(config);
    const { stop } = await startServer({ config, logger });
    const shutdown = async signal => {
      logger.info({ signal }, 'Shutting down');
      try { await stop(); } catch { logger.error('Shutdown failed'); process.exitCode = 1; }
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  } catch {
    // Configuration values and unexpected startup error messages can contain secrets.
    console.error('Server startup failed. Check configuration, port availability and PostgreSQL connection.');
    process.exitCode = 1;
  }
}
