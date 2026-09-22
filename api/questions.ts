import type { VercelRequest, VercelResponse } from '@vercel/node';
import { atlasQuestionStore, EARLIEST_YEAR, LATEST_YEAR } from '../server/question-store.js';
import { AuthConfigError } from '../server/auth/config.js';
import { authenticate, resolveAuthDeps } from '../server/auth/routes.js';
import { describeError } from '../server/log.js';

let store: ReturnType<typeof atlasQuestionStore> | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie');

  // Authorise here rather than relying on the routing middleware, so the
  // function is closed even if it is reached directly.
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
    res.status(401).json({ error: 'Sign in to read the question bank.' });
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'GET only' });
    return;
  }

  const url = new URL(req.url || '/', 'http://localhost');
  const params = {
    search: (url.searchParams.get('search') || '').slice(0, 200),
    offset: Number(url.searchParams.get('offset') || 0),
    limit: Number(url.searchParams.get('limit') || 1),
    random: url.searchParams.get('random') === 'true',
    minYear: Number(url.searchParams.get('minYear') || 0),
  };
  if (
    ![params.offset, params.limit, params.minYear].every(Number.isSafeInteger) ||
    params.offset < 0 ||
    params.limit < 1 ||
    params.limit > 100 ||
    (params.minYear !== 0 && (params.minYear < EARLIEST_YEAR || params.minYear > LATEST_YEAR))
  ) {
    res.status(400).json({ error: 'Invalid pagination' });
    return;
  }

  try {
    store ??= atlasQuestionStore(deps.config.mongoUri, deps.config.mongoDatabase);
    res.status(200).json(await store.query(params));
  } catch {
    res.status(503).json({ error: 'The question database is temporarily unavailable.' });
  }
}
