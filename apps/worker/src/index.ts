import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { attachmentRoutes } from './routes/attachments';
import { attemptRoutes } from './routes/attempts';
import { classroomRoutes } from './routes/classroom';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_FRONTEND_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return cors({
    origin: (origin) => (origin && allowed.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 600,
  })(c, next);
});

app.route('/', healthRoutes);
app.route('/', authRoutes);
app.route('/', attachmentRoutes);
app.route('/', attemptRoutes);
app.route('/', classroomRoutes);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  console.error('worker error', err);
  return c.json({ error: 'Internal error', detail: String(err) }, 500);
});

export default app;
