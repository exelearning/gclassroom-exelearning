import { Hono } from 'hono';
import type { Env } from '../types';
import { exchangeAuthorizationCode, getUserInfoFromAccessToken } from '../auth/google-oauth';
import { encryptRefreshToken } from '../crypto/token-vault';
import { upsertUser } from '../db/queries';

export const authRoutes = new Hono<{ Bindings: Env }>();

interface ExchangeBody {
  code: string;
  redirectUri: string;
}

authRoutes.post('/api/auth/exchange', async (c) => {
  let body: ExchangeBody;
  try {
    body = (await c.req.json()) as ExchangeBody;
  } catch {
    return c.json({ error: 'Body must be JSON.' }, 400);
  }
  if (!body.code || !body.redirectUri) {
    return c.json({ error: 'code and redirectUri are required.' }, 400);
  }
  try {
    const tokens = await exchangeAuthorizationCode(c.env, body.code, body.redirectUri);
    const userInfo = await getUserInfoFromAccessToken(tokens.accessToken);
    let encrypted: string | null = null;
    if (tokens.refreshToken) {
      encrypted = await encryptRefreshToken(tokens.refreshToken, c.env.TOKEN_VAULT_KEY);
    }
    await upsertUser(c.env, {
      googleUserId: userInfo.sub,
      email: userInfo.email,
      displayName: userInfo.name,
      encryptedRefreshToken: encrypted,
    });
    return c.json({
      ok: true,
      hasRefreshToken: Boolean(tokens.refreshToken),
      userSub: userInfo.sub,
      email: userInfo.email ?? null,
      scope: tokens.scope,
      expiresIn: tokens.expiresIn,
    });
  } catch (error) {
    return c.json({ error: 'Token exchange failed.', detail: String(error) }, 500);
  }
});
