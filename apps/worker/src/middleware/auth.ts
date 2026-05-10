import type { Context, Next } from 'hono';
import type { Env } from '../types';
import { getUserInfoFromAccessToken } from '../auth/google-oauth';

export interface AuthVariables {
  user: { sub: string; email?: string; name?: string; hd?: string };
  accessToken: string;
}

/**
 * Require a valid Google Bearer access token on the request. We delegate
 * verification to Google's userinfo endpoint, which is the simplest way to
 * confirm the token is valid AND map it to a user. For higher throughput a
 * cached `tokeninfo` lookup or local ID-token JWT verification would be
 * preferable.
 */
export async function requireGoogleAuth(c: Context<{ Bindings: Env; Variables: AuthVariables }>, next: Next): Promise<Response | void> {
  const auth = c.req.header('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  if (!match) {
    return c.json({ error: 'Missing Bearer access token.' }, 401);
  }
  const accessToken = match[1]!;
  try {
    const user = await getUserInfoFromAccessToken(accessToken);
    c.set('user', user);
    c.set('accessToken', accessToken);
  } catch (error) {
    return c.json({ error: 'Invalid or expired Google access token.', detail: String(error) }, 401);
  }
  await next();
}
