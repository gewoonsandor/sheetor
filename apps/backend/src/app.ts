import Fastify from 'fastify';
import { registerSwagger } from './plugins/swagger.js';
import { registerModules } from './modules/index.js';
import { registerFrontend } from './plugins/frontend.js';
import { env } from './config/env.js';

export const buildApp = async () => {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
  });

  await registerSwagger(app);
  await registerModules(app);
  await registerFrontend(app, env);

  return app;
};
