import { env } from './config/env.js';
import { buildApp } from './app.js';

const start = async (): Promise<void> => {
  const app = await buildApp();

  try {
    await app.listen({ port: env.port, host: env.host });
    app.log.info(`Backend listening on http://${env.host}:${env.port}`);
    app.log.info(`Frontend available at http://${env.host}:${env.port}/`);
    app.log.info(`Swagger docs available at http://${env.host}:${env.port}/docs`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
