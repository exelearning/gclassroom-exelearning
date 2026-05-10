import { requireGoogleClientId } from '../config';

type GoogleTokenError = {
  error: string;
  error_description?: string;
  error_uri?: string;
};

type GoogleTokenResponse = Partial<GoogleTokenError> & {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type GoogleTokenClient = {
  callback: (response: GoogleTokenResponse) => void;
  requestAccessToken: (overrideConfig?: { prompt?: string; scope?: string; hint?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (error: unknown) => void;
            include_granted_scopes?: boolean;
            hint?: string;
          }) => GoogleTokenClient;
          revoke: (accessToken: string, done?: () => void) => void;
        };
      };
    };
  }
}

export interface GoogleAccessToken {
  accessToken: string;
  expiresAt: number;
  scope: string;
  tokenType: string;
}

export interface RequestTokenOptions {
  prompt?: '' | 'none' | 'consent' | 'select_account';
  hint?: string;
  scope?: string;
  /** Force a fresh interactive consent rather than reuse the cached token. */
  interactive?: boolean;
}

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const DEFAULT_EXPIRY_SKEW_MS = 60_000;
let gisLoaded: Promise<void> | null = null;

export interface GoogleTokenClientOptions {
  scopes: string[];
  clientId?: string;
}

export interface InMemoryTokenClient {
  getAccessToken(options?: RequestTokenOptions): Promise<string>;
  current(): GoogleAccessToken | null;
  clear(): void;
  revoke(): Promise<void>;
}

const cache = new Map<string, InMemoryTokenClient>();

export function getTokenClient(options: GoogleTokenClientOptions): InMemoryTokenClient {
  const key = options.scopes.slice().sort().join(' ');
  const existing = cache.get(key);
  if (existing) return existing;

  const created = createTokenClient(options);
  cache.set(key, created);
  return created;
}

function createTokenClient(options: GoogleTokenClientOptions): InMemoryTokenClient {
  const clientId = options.clientId ?? requireGoogleClientId();
  const scope = options.scopes.join(' ');
  let client: GoogleTokenClient | null = null;
  let token: GoogleAccessToken | null = null;
  let pending: Promise<string> | null = null;
  let pendingReject: ((error: Error) => void) | null = null;

  const oauth2 = () => {
    const o = window.google?.accounts?.oauth2;
    if (!o) throw new Error('Google Identity Services has not loaded yet.');
    return o;
  };

  const ensureClient = () => {
    if (client) return client;
    client = oauth2().initTokenClient({
      client_id: clientId,
      scope,
      include_granted_scopes: true,
      callback: () => undefined,
      error_callback: (error) => {
        pending = null;
        pendingReject?.(new Error(`Google authorization failed: ${String(error)}`));
        pendingReject = null;
      },
    });
    return client;
  };

  const isFresh = () => token !== null && token.expiresAt - DEFAULT_EXPIRY_SKEW_MS > Date.now();

  const requestNew = async (req: RequestTokenOptions): Promise<string> => {
    await loadGoogleIdentityServices();
    return new Promise<string>((resolve, reject) => {
      const c = ensureClient();
      pendingReject = reject;
      c.callback = (response) => {
        pending = null;
        pendingReject = null;
        if (response.error) {
          reject(new Error(response.error_description ?? response.error));
          return;
        }
        if (!response.access_token) {
          reject(new Error('Google did not return an access token.'));
          return;
        }
        token = {
          accessToken: response.access_token,
          expiresAt: Date.now() + (response.expires_in ?? 0) * 1000,
          scope: response.scope ?? scope,
          tokenType: response.token_type ?? 'Bearer',
        };
        resolve(token.accessToken);
      };
      c.requestAccessToken({
        prompt: req.prompt ?? (token ? '' : 'consent'),
        scope: req.scope,
        hint: req.hint,
      });
    });
  };

  return {
    async getAccessToken(req = {}) {
      if (!req.interactive && isFresh()) return token!.accessToken;
      pending ??= requestNew(req);
      return pending;
    },
    current: () => token,
    clear: () => { token = null; pending = null; },
    revoke: () => new Promise((resolve) => {
      const accessToken = token?.accessToken;
      token = null; pending = null;
      if (!accessToken) return resolve();
      try { oauth2().revoke(accessToken, resolve); } catch { resolve(); }
    }),
  };
}

async function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.oauth2) return;
  gisLoaded ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing ?? document.createElement('script');
    const timeout = window.setTimeout(() => reject(new Error('Timed out loading Google Identity Services.')), 10_000);
    const finish = () => {
      window.clearTimeout(timeout);
      if (window.google?.accounts?.oauth2) resolve();
      else reject(new Error('Google Identity Services loaded without OAuth.'));
    };
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => {
      window.clearTimeout(timeout);
      reject(new Error('Failed to load Google Identity Services.'));
    }, { once: true });
    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.append(script);
    } else if (window.google?.accounts?.oauth2) {
      finish();
    }
  }).catch((error: unknown) => {
    gisLoaded = null;
    throw error;
  });
  await gisLoaded;
}
