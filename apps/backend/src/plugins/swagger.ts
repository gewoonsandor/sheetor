import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

export const registerSwagger = async (app: FastifyInstance): Promise<void> => {
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Sheetor API',
        description: 'Sheetor backend API documentation',
        version: '1.0.0',
      },
      servers: [{ url: '/' }],
      tags: [{ name: 'system', description: 'System endpoints' }],
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    staticCSP: true,
  });
};
