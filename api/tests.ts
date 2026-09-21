import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AuthConfigError } from '../server/auth/config.js';
import { authenticate, resolveAuthDeps } from '../server/auth/routes.js';
import { mongoHistoryStore } from '../server/history/store.js';
import { handleHistoryRequest } from '../server/history/routes.js';
import { describeError } from '../server/log.js';

/** Past tests for the signed-in reader. Authorises here rather than relying on
 *  the routing middleware, so the function is closed if reached directly. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie');

  const deps = resolveAuthDeps();
  if (deps instanceof AuthConfigError) {
    console.error('Auth is not configured:', deps.message);
    res.status(503).json({ error: 'The service is not configured.' });
    return;
  }

  const cookie = typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined;
  let signedIn;
  try {
    signedIn = await authenticate(deps, { cookie });
  } catch (cause) {
    console.error('Session check failed:', describeError(cause));
    res.status(503).json({ error: 'The service is temporarily unavailable.' });
    return;
  }
  if (!signedIn) {
    res.status(401).json({ error: 'Sign in to see your past tests.' });
    return;
  }

  const url = new URL(req.url || '/', 'http://localhost');
  try {
    const result = await handleHistoryRequest(mongoHistoryStore(deps.config), signedIn.user._id, {
      method: String(req.method ?? 'GET').toUpperCase(),
      query: url.searchParams,
      body: req.body,
    });
    if (result.body === undefined) res.status(result.status).end();
    else res.status(result.status).json(result.body);
  } catch (cause) {
    console.error('Past tests failed:', describeError(cause));
    res.status(503).json({ error: 'Your past tests are temporarily unavailable.' });
  }
}
