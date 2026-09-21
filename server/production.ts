import { createServer } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { QuestionQuery } from './question-store.js';
import { authenticate, handleAuthRequest, type AuthDeps, type AuthRequest } from './auth/routes.js';
import { secureCookiesFor } from './auth/config.js';
import { handleHistoryRequest } from './history/routes.js';
import type { HistoryStore } from './history/store.js';

type Store = { query: (params: QuestionQuery) => Promise<unknown> };

const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP =
  "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; " +
  "img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; " +
  "form-action 'self'";

function collectAssets(directory: string, prefix = '', into = new Map<string, string>()) {
  for (const file of readdirSync(directory, { withFileTypes: true })) {
    if (file.name.startsWith('.')) continue;
    const key = `${prefix}/${file.name}`;
    if (file.isDirectory()) collectAssets(join(directory, file.name), key, into);
    else if (file.isFile() && mime[extname(file.name)]) into.set(key, join(directory, file.name));
  }
  return into;
}

/** Reads a JSON body, capped so a huge upload cannot be buffered. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  if (req.method !== 'POST' && req.method !== 'PUT') return undefined;

  const limit = 2 * 1024 * 1024;
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Body too large');
    chunks.push(chunk as Buffer);
  }
  if (!size) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return undefined;
  }
}

function toAuthRequest(req: IncomingMessage, secure: boolean): AuthRequest {
  const host = req.headers.host ?? 'localhost';
  const url = new URL(req.url ?? '/', `${secure ? 'https' : 'http'}://${host}`);
  return {
    method: (req.method ?? 'GET').toUpperCase(),
    path: url.pathname,
    query: url.searchParams,
    cookie: req.headers.cookie,
    userAgent: req.headers['user-agent'] ?? null,
    requestOrigin: `${secure ? 'https' : 'http'}://${host}`,
    secure,
  };
}

/** The app shell is public so the sign-in page can load. Question data requires
 *  a live session, checked here and not delegated to anything upstream. */
export function createProductionServer(config: {
  dist: string;
  store: Store;
  history: HistoryStore;
  auth: AuthDeps;
  /** Overrides the transport decision. Only tests should need this. */
  secure?: boolean;
}) {
  const assets = collectAssets(config.dist);
  if (!assets.has('/index.html')) throw new Error('Build the frontend before starting the server');

  // Taken from PUBLIC_ORIGIN, not from NODE_ENV, which nothing here ever sets.
  // Without it we are on plain local HTTP, where Secure cookies cannot be sent.
  const secure = config.secure ?? secureCookiesFor(config.auth.config) ?? false;

  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', CSP);
    if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');

    try {
      const request = toAuthRequest(req, secure);

      if (request.path.startsWith('/api/auth/')) {
        const result = await handleAuthRequest(config.auth, request);
        if (!result) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
        res.statusCode = result.status;
        res.end(result.body === undefined ? undefined : JSON.stringify(result.body));
        return;
      }

      if (request.path === '/api/questions') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        const signedIn = await authenticate(config.auth, request);
        if (!signedIn) {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: 'Sign in to read the question bank.' }));
          return;
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          res.writeHead(405, { Allow: 'GET, HEAD' });
          res.end(JSON.stringify({ error: 'GET only' }));
          return;
        }
        const params = {
          search: (request.query.get('search') || '').slice(0, 200),
          offset: Number(request.query.get('offset') || 0),
          limit: Number(request.query.get('limit') || 1),
          random: request.query.get('random') === 'true',
        };
        if (
          ![params.offset, params.limit].every(Number.isSafeInteger) ||
          params.offset < 0 ||
          params.limit < 1 ||
          params.limit > 100
        ) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Invalid pagination' }));
          return;
        }
        const data = await config.store.query(params);
        res.end(request.method === 'HEAD' ? undefined : JSON.stringify(data));
        return;
      }

      if (request.path === '/api/tests') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        const signedIn = await authenticate(config.auth, request);
        if (!signedIn) {
          res.statusCode = 401;
          res.end(JSON.stringify({ error: 'Sign in to see your past tests.' }));
          return;
        }
        const result = await handleHistoryRequest(config.history, signedIn.user._id, {
          method: request.method,
          query: request.query,
          body: await readJsonBody(req),
        });
        res.statusCode = result.status;
        res.end(result.body === undefined ? undefined : JSON.stringify(result.body));
        return;
      }

      if (request.path.startsWith('/api/')) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end('Method not allowed.');
        return;
      }

      const path = decodeURIComponent(request.path);
      // Paths the browser routes itself fall back to the shell. Anything that
      // looks like a file does not, so a missing asset still reports 404.
      const looksLikeFile = /\.[a-z0-9]+$/i.test(path);
      const file =
        assets.get(path === '/' ? '/index.html' : path) ??
        (looksLikeFile ? undefined : assets.get('/index.html'));
      if (!file) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found.');
        return;
      }
      res.setHeader('Content-Type', mime[extname(file)]);
      res.end(request.method === 'HEAD' ? undefined : readFileSync(file));
    } catch {
      if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'The service is temporarily unavailable.' }));
    }
  }) satisfies ReturnType<typeof createServer>;
}

export type { ServerResponse };
