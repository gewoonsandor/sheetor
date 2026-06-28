import type { FastifyInstance } from 'fastify';
import { healthRoutes } from './health/routes.js';

export const registerModules = async (app: FastifyInstance): Promise<void> => {
  await app.register(healthRoutes, { prefix: '/api/v1' });
};
