import type { VercelRequest, VercelResponse } from '@vercel/node';
import { atlasQuestionStore } from '../server/question-store.js';
import { passwordAuthorized } from '../server/password.js';

let store: ReturnType<typeof atlasQuestionStore> | undefined;
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  // Also protect the function independently of the routing middleware.
  if (!passwordAuthorized(req.headers.authorization || '', process.env.APP_PASSWORD, process.env.APP_USERNAME || 'pax')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Pax", charset="UTF-8"');
    res.status(401).json({ error: 'Password required.' }); return;
  }
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.status(405).json({ error: 'GET only' }); return; }
  const url = new URL(req.url || '/', 'http://localhost');
  const params = { search: (url.searchParams.get('search') || '').slice(0, 200), offset: Number(url.searchParams.get('offset') || 0), limit: Number(url.searchParams.get('limit') || 1), random: url.searchParams.get('random') === 'true' };
  if (![params.offset, params.limit].every(Number.isSafeInteger) || params.offset < 0 || params.limit < 1 || params.limit > 100) {
    res.status(400).json({ error: 'Invalid pagination' }); return;
  }
  try {
    if (!process.env.MONGODB_URI) throw new Error('Not configured');
    store ??= atlasQuestionStore(process.env.MONGODB_URI, process.env.MONGODB_DATABASE || 'pax');
    res.status(200).json(await store.query(params));
  } catch {
    res.status(503).json({ error: 'The question database is temporarily unavailable.' });
  }
}
