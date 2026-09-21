import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AuthConfigError, isLoopbackHost, secureCookiesFor, type AuthConfig } from './config.js';
import { handleAuthRequest, resolveAuthDeps, type AuthRequest } from './routes.js';
import { describeError } from '../log.js';

/** Builds the transport-free request the auth routes work with.
 *
 *  Whether cookies carry Secure comes from configuration when it is available,
 *  because a request header must not be able to downgrade a session cookie. The
 *  header is only a fallback, and then the LAST value is used: proxies append,
 *  so the last entry is the one added by the nearest proxy, while the first is
 *  whatever the client sent. */
export function toAuthRequest(req: VercelRequest, config?: AuthConfig): AuthRequest {
  const host = String(req.headers.host ?? 'localhost');
  const forwarded = String(req.headers['x-forwarded-proto'] ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .pop();

  const configured = config ? secureCookiesFor(config) : null;
  const secure = configured ?? (forwarded ? forwarded === 'https' : !isLoopbackHost(host));

  const url = new URL(req.url ?? '/', `${secure ? 'https' : 'http'}://${host}`);
  const agent = req.headers['user-agent'];

  return {
    method: String(req.method ?? 'GET').toUpperCase(),
    path: url.pathname,
    query: url.searchParams,
    cookie: typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined,
    userAgent: typeof agent === 'string' ? agent : null,
    requestOrigin: `${secure ? 'https' : 'http'}://${host}`,
    secure,
  };
}

/** The one adapter every /api/auth route file delegates to. Each route is its
 *  own file because a catch-all did not reliably match nested paths. */
export default async function handleAuthOnVercel(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie');

  const deps = resolveAuthDeps();
  if (deps instanceof AuthConfigError) {
    // Fail closed, and never tell the browser which setting is missing.
    console.error('Auth is not configured:', deps.message);
    res.status(503).json({ error: 'Sign-in is not configured.' });
    return;
  }

  const request = toAuthRequest(req, deps.config);
  let result;
  try {
    result = await handleAuthRequest(deps, request);
  } catch (cause) {
    console.error('Auth route failed:', describeError(cause));
    res.status(503).json({ error: 'Sign-in is temporarily unavailable.' });
    return;
  }

  if (!result) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  if (result.body === undefined) res.status(result.status).end();
  else res.status(result.status).json(result.body);
}
