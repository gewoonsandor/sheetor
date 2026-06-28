import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyHttpProxy from '@fastify/http-proxy';
import type { AppEnv } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDistDir = path.resolve(__dirname, '../../../frontend/dist');

const isApiOrDocsPath = (url: string): boolean => {
  return url.startsWith('/api') || url.startsWith('/docs');
};

export const registerFrontend = async (app: FastifyInstance, env: AppEnv): Promise<void> => {
  if (env.nodeEnv === 'development') {
    await app.register(fastifyHttpProxy, {
      upstream: env.frontendDevUrl,
      prefix: '/',
      websocket: true,
      rewritePrefix: '/',
    });
    return;
  }

  await app.register(fastifyStatic, {
    root: frontendDistDir,
    prefix: '/',
    decorateReply: true,
  });

  app.setNotFoundHandler((req, reply) => {
    if (isApiOrDocsPath(req.url)) {
      reply.code(404).send({ message: 'Not Found' });
      return;
    }
    return reply.sendFile('index.html');
  });
};
