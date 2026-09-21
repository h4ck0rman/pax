import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { QuestionQuery } from './question-store.js';

type Store = { query: (params: QuestionQuery) => Promise<unknown> };
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

/** Authentication is checked before routing or reading any response content. */
export function createProductionServer(config: { password: string; username?: string; dist: string; store: Store }) {
  if (!config.password || config.password.length < 16) throw new Error('APP_PASSWORD must contain at least 16 characters');
  const username = config.username || 'pax';
  if (username.includes(':')) throw new Error('APP_USERNAME cannot contain a colon');
  const hash = (value: string) => createHash('sha256').update(value).digest();
  const expected = hash(`${username}:${config.password}`);
  const assets = new Map<string, string>();
  function collect(directory: string, prefix = '') {
    for (const file of readdirSync(directory, { withFileTypes: true })) {
      if (file.name.startsWith('.')) continue;
      const key = `${prefix}/${file.name}`;
      if (file.isDirectory()) collect(join(directory, file.name), key);
      else if (file.isFile() && mime[extname(file.name)]) assets.set(key, join(directory, file.name));
    }
  }
  collect(config.dist);
  if (!assets.has('/index.html')) throw new Error('Build the frontend before starting the server');
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    const authorization = req.headers.authorization || '';
    const valid = authorization.length <= 4096 && /^Basic [A-Za-z0-9+/]+=*$/i.test(authorization)
      && timingSafeEqual(hash(Buffer.from(authorization.slice(6), 'base64').toString('utf8')), expected);
    if (!valid) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Pax", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Password required.');
      return;
    }
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed.'); return; }
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname === '/api/questions') {
        const params = { search: (url.searchParams.get('search') || '').slice(0, 200), offset: Number(url.searchParams.get('offset') || 0), limit: Number(url.searchParams.get('limit') || 1), random: url.searchParams.get('random') === 'true' };
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        if (![params.offset, params.limit].every(Number.isSafeInteger) || params.offset < 0 || params.limit < 1 || params.limit > 100) {
          res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid pagination' })); return;
        }
        const data = await config.store.query(params);
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(data));
        return;
      }
      const path = decodeURIComponent(url.pathname);
      const file = assets.get(path === '/' ? '/index.html' : path);
      if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found.'); return; }
      res.setHeader('Content-Type', mime[extname(file)]);
      res.end(req.method === 'HEAD' ? undefined : readFileSync(file));
    } catch {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'The service is temporarily unavailable.' }));
    }
  });
}
