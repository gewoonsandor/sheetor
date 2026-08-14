import { env } from './config/env.js';
import { buildApp } from './app.js';

let closing = false;

const start = async (): Promise<void> => {
  const app = await buildApp();

  try {
    await app.listen({ port: env.port, host: env.host });
    app.log.info(`Backend listening on http://${env.host}:${env.port}`);
    app.log.info(`Frontend available at http://${env.host}:${env.port}/`);
    app.log.info(`Swagger docs available at http://${env.host}:${env.port}/docs`);

    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.on(signal, () => {
        if (closing) return;
        closing = true;
        app.log.info(`Shutting down (${signal})`);
        app.close().then(
          () => process.exit(0),
          (error: unknown) => {
            app.log.error(error);
            process.exit(1);
          },
        );
      });
    }
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

void start();
