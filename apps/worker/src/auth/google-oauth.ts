import type { Env } from '../types';

/** Verify a Google access token by calling the userinfo endpoint. */
export async function getUserInfoFromAccessToken(accessToken: string): Promise<{
  sub: string;
  email?: string;
  name?: string;
  hd?: string;
}> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to validate Google access token (${res.status}).`);
  }
  return res.json() as Promise<{ sub: string; email?: string; name?: string; hd?: string }>;
}

/** Exchange an OAuth authorization code for tokens. */
export async function exchangeAuthorizationCode(
  env: Env,
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken?: string; idToken?: string; expiresIn: number; scope: string; }> {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  const res = await fetch(env.GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return {
    accessToken: String(data['access_token']),
    refreshToken: typeof data['refresh_token'] === 'string' ? (data['refresh_token'] as string) : undefined,
    idToken: typeof data['id_token'] === 'string' ? (data['id_token'] as string) : undefined,
    expiresIn: Number(data['expires_in'] ?? 0),
    scope: typeof data['scope'] === 'string' ? (data['scope'] as string) : '',
  };
}

/** Refresh an access token from a stored refresh token. */
export async function refreshAccessToken(env: Env, refreshToken: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch(env.GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  return {
    accessToken: String(data['access_token']),
    expiresIn: Number(data['expires_in'] ?? 0),
  };
}
