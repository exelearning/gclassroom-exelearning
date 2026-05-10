import { Hono } from 'hono';
import type { Env } from '../types';

export const healthRoutes = new Hono<{ Bindings: Env }>();

healthRoutes.get('/health', (c) => {
  return c.json({
    ok: true,
    version: '0.1.0',
    time: new Date().toISOString(),
  });
});
