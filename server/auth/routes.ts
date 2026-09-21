import { AuthConfigError, emailAllowed, readAuthConfig, type AuthConfig } from './config.js';
import {
  GoogleAuthError,
  buildAuthorizationUrl,
  createPkcePair,
  exchangeCodeForProfile,
  randomToken,
} from './google.js';
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  clearCookie,
  readCookie,
  serialiseCookie,
  signOAuthToken,
  signSessionToken,
  verifyOAuthToken,
  verifySessionToken,
} from './tokens.js';
import {
  SESSION_TTL_MS,
  mongoAuthStore,
  publicUser,
  type AuthStore,
  type PublicUser,
  type SessionRecord,
  type UserRecord,
} from './store.js';

export const CALLBACK_PATH = '/api/auth/google/callback';
export const START_PATH = '/api/auth/google/start';

export type AuthRequest = {
  method: string;
  /** Path only, without the query string. */
  path: string;
  query: URLSearchParams;
  cookie: string | undefined;
  userAgent: string | null;
  /** Scheme and host this request arrived on, used only as a fallback origin. */
  requestOrigin: string;
  secure: boolean;
};

export type AuthResponse = {
  status: number;
  headers: Record<string, string | string[]>;
  body?: unknown;
};

export type AuthDeps = {
  config: AuthConfig;
  store: AuthStore;
  fetchImpl?: typeof fetch;
  /** Overridden in tests so the success path can run without Google. */
  exchange?: typeof exchangeCodeForProfile;
};

const json = (status: number, body: unknown, headers: Record<string, string | string[]> = {}) => ({
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  body,
});

const redirect = (location: string, headers: Record<string, string | string[]> = {}) => ({
  status: 302,
  headers: { Location: location, ...headers },
});

/** Resolve dependencies from the environment, or report why we cannot. */
export function resolveAuthDeps(env: NodeJS.ProcessEnv = process.env): AuthDeps | AuthConfigError {
  try {
    const config = readAuthConfig(env);
    return { config, store: mongoAuthStore(config) };
  } catch (cause) {
    return cause instanceof AuthConfigError ? cause : new AuthConfigError('Auth is misconfigured');
  }
}

/** The redirect URI comes only from configuration. It is deliberately never
 *  derived from the request Host, so no header can influence where Google is
 *  asked to send an authorization code. Configuration guarantees this is set
 *  whenever Google is configured. */
function callbackUri(config: AuthConfig): string | null {
  return config.publicOrigin ? `${config.publicOrigin}${CALLBACK_PATH}` : null;
}

export type Authenticated = { user: UserRecord; session: SessionRecord };

/** The single gate every protected route goes through: a valid signature, and a
 *  session record that is still live on the server. */
export async function authenticate(
  deps: AuthDeps,
  request: Pick<AuthRequest, 'cookie'>,
): Promise<Authenticated | null> {
  const token = readCookie(request.cookie, SESSION_COOKIE);
  if (!token) return null;

  const claims = await verifySessionToken(deps.config.sessionSecret, token);
  if (!claims) return null;

  const session = await deps.store.liveSession(claims.sessionId);
  if (!session || session.userId !== claims.userId) return null;

  const user = await deps.store.userById(claims.userId);
  if (!user) return null;

  // A person removed from the allowlist loses access at their next request.
  if (!emailAllowed(deps.config, user.email)) return null;

  return { user, session };
}

async function startSignIn(deps: AuthDeps, request: AuthRequest): Promise<AuthResponse> {
  const client = deps.config.google;
  const redirectUri = callbackUri(deps.config);
  if (!client || !redirectUri) return redirect('/?error=config');

  const state = randomToken();
  const nonce = randomToken();
  const { codeVerifier, codeChallenge } = createPkcePair();

  const pending = await signOAuthToken(deps.config.sessionSecret, { state, nonce, codeVerifier });

  return redirect(
    buildAuthorizationUrl(client, { redirectUri, state, nonce, codeChallenge }),
    {
      'Set-Cookie': serialiseCookie(OAUTH_COOKIE, pending, {
        maxAgeSeconds: 600,
        secure: request.secure,
      }),
    },
  );
}

async function completeSignIn(deps: AuthDeps, request: AuthRequest): Promise<AuthResponse> {
  const failure = (reason: string) =>
    redirect(`/?error=${reason}`, { 'Set-Cookie': clearCookie(OAUTH_COOKIE, request.secure) });

  const client = deps.config.google;
  const redirectUri = callbackUri(deps.config);
  if (!client || !redirectUri) return failure('config');
  if (request.query.get('error')) return failure('denied');

  const pendingToken = readCookie(request.cookie, OAUTH_COOKIE);
  const pending = pendingToken
    ? await verifyOAuthToken(deps.config.sessionSecret, pendingToken)
    : null;
  if (!pending) return failure('expired');

  const state = request.query.get('state') ?? '';
  const code = request.query.get('code') ?? '';
  if (!code || state !== pending.state) return failure('state');

  let profile;
  try {
    profile = await (deps.exchange ?? exchangeCodeForProfile)(
      client,
      { code, redirectUri, codeVerifier: pending.codeVerifier, nonce: pending.nonce },
      deps.fetchImpl,
    );
  } catch (cause) {
    return failure(cause instanceof GoogleAuthError ? 'google' : 'google');
  }

  if (!emailAllowed(deps.config, profile.email)) return failure('not_allowed');

  const user = await deps.store.upsertUser({
    googleSubject: profile.subject,
    email: profile.email,
    name: profile.name,
  });
  const session = await deps.store.createSession(user._id, request.userAgent);
  const token = await signSessionToken(
    deps.config.sessionSecret,
    { userId: user._id, sessionId: session._id },
    session.expiresAt,
  );

  return redirect('/', {
    'Set-Cookie': [
      serialiseCookie(SESSION_COOKIE, token, {
        maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000),
        secure: request.secure,
      }),
      clearCookie(OAUTH_COOKIE, request.secure),
    ],
  });
}

/** Who is signed in. Extends a session that is more than half spent, so an
 *  active reader is not signed out mid-test, bounded by the absolute ceiling. */
async function whoAmI(deps: AuthDeps, request: AuthRequest): Promise<AuthResponse> {
  const current = await authenticate(deps, request);
  if (!current) return json(401, { error: 'Not signed in' });

  const { session, user } = current;
  const now = Date.now();
  const halfSpent = session.expiresAt.getTime() - now < SESSION_TTL_MS / 2;

  if (halfSpent) {
    const extended = new Date(
      Math.min(now + SESSION_TTL_MS, session.absoluteExpiresAt.getTime()),
    );
    if (extended.getTime() > session.expiresAt.getTime()) {
      await deps.store.touchSession(session._id, extended);
      const token = await signSessionToken(
        deps.config.sessionSecret,
        { userId: user._id, sessionId: session._id },
        extended,
      );
      return json(
        200,
        { user: publicUser(user) satisfies PublicUser },
        {
          'Set-Cookie': serialiseCookie(SESSION_COOKIE, token, {
            maxAgeSeconds: Math.max(0, Math.floor((extended.getTime() - now) / 1000)),
            secure: request.secure,
          }),
        },
      );
    }
  }

  return json(200, { user: publicUser(user) });
}

async function signOut(deps: AuthDeps, request: AuthRequest): Promise<AuthResponse> {
  const current = await authenticate(deps, request);
  if (current) await deps.store.revokeSession(current.session._id);
  // Always clear the cookie, so a stale or unknown token stops being presented.
  return {
    status: 204,
    headers: { 'Set-Cookie': clearCookie(SESSION_COOKIE, request.secure) },
  };
}

/** Routes under /api/auth. Returns null when the path is not an auth route. */
export async function handleAuthRequest(
  deps: AuthDeps,
  request: AuthRequest,
): Promise<AuthResponse | null> {
  if (request.path === START_PATH) {
    if (request.method !== 'GET') return json(405, { error: 'GET only' }, { Allow: 'GET' });
    return startSignIn(deps, request);
  }
  if (request.path === CALLBACK_PATH) {
    if (request.method !== 'GET') return json(405, { error: 'GET only' }, { Allow: 'GET' });
    return completeSignIn(deps, request);
  }
  if (request.path === '/api/auth/me') {
    if (request.method !== 'GET') return json(405, { error: 'GET only' }, { Allow: 'GET' });
    return whoAmI(deps, request);
  }
  if (request.path === '/api/auth/logout') {
    if (request.method !== 'POST') return json(405, { error: 'POST only' }, { Allow: 'POST' });
    return signOut(deps, request);
  }
  return null;
}
