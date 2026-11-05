import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { DemoSessions } from './features/demo/demo-session.js';

export function serveWeb(app: FastifyInstance, root: string, sessions?: DemoSessions): void {
  app.get('/', async (request, reply) => {
    if (sessions?.accessToken && !sessions.fromCookie(request.headers.cookie)) return reply.code(401).type('text/plain').send('请使用评委演示链接进入');
    try { return reply.type('text/html; charset=utf-8').send(await readFile(join(root, 'index.html'))); }
    catch { return reply.code(503).send('Web build is missing'); }
  });
  app.get('/assets/*', async (request, reply) => {
    if (sessions?.accessToken && !sessions.fromCookie(request.headers.cookie)) return reply.code(401).send('请使用评委演示链接进入');
    const name = (request.params as { '*': string })['*'];
    if (!/^[A-Za-z0-9._/-]+$/.test(name) || name.includes('..')) return reply.code(404).send();
    const type = name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    try { return reply.type(type).send(await readFile(join(root, 'assets', name))); }
    catch { return reply.code(404).send(); }
  });
}
