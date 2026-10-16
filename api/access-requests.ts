import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AuthConfigError } from '../server/auth/config.js';
import { resolveAuthDeps } from '../server/auth/routes.js';
import { mongoAccessStore } from '../server/access/store.js';
import { handleAccessRequest } from '../server/access/routes.js';
import { describeError } from '../server/log.js';

/** Public: how someone not yet on the allowlist asks to be added. Unlike the
 *  other data routes it does not authenticate, so the middleware lets it
 *  through. It still answers the same way whatever the address, so it never
 *  reveals who is on the list. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');

  const deps = resolveAuthDeps();
  if (deps instanceof AuthConfigError) {
    console.error('Auth is not configured:', deps.message);
    res.status(503).json({ error: 'The service is not configured.' });
    return;
  }

  try {
    const result = await handleAccessRequest(mongoAccessStore(deps.config), {
      method: String(req.method ?? 'GET').toUpperCase(),
      body: req.body,
    });
    if (result.body === undefined) res.status(result.status).end();
    else res.status(result.status).json(result.body);
  } catch (cause) {
    console.error('Access request failed:', describeError(cause));
    res.status(503).json({ error: 'Could not record your request. Please try again.' });
  }
}
