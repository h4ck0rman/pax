import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { atlasQuestionStore } from './server/question-store';
import { AuthConfigError } from './server/auth/config';
import {
  authenticate,
  handleAuthRequest,
  resolveAuthDeps,
  type AuthDeps,
  type AuthRequest,
} from './server/auth/routes';
import { SESSION_COOKIE, serialiseCookie, signSessionToken } from './server/auth/tokens';
import { SESSION_TTL_MS } from './server/auth/store';

const DEV_SIGN_IN_PATH = '/api/auth/dev-sign-in';

function toAuthRequest(req: IncomingMessage): AuthRequest {
  const host = req.headers.host ?? '127.0.0.1:5173';
  const url = new URL(req.url ?? '/', `http://${host}`);
  return {
    method: (req.method ?? 'GET').toUpperCase(),
    path: url.pathname,
    query: url.searchParams,
    cookie: req.headers.cookie,
    userAgent: req.headers['user-agent'] ?? null,
    requestOrigin: `http://${host}`,
    // Development is plain HTTP, so cookies cannot carry Secure here.
    secure: false,
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/** Development and preview only. Mints a session without Google, so the app and
 *  the browser tests can run without an OAuth client. This lives in the Vite
 *  config on purpose: the file is never part of a deployment, so the shim cannot
 *  exist in production. It still refuses addresses outside the allowlist. */
async function devSignIn(deps: AuthDeps, req: IncomingMessage, res: ServerResponse, email: string) {
  const user = await deps.store.upsertUser({
    googleSubject: `dev:${email}`,
    email,
    name: email.split('@')[0],
  });
  const session = await deps.store.createSession(user._id, req.headers['user-agent'] ?? null);
  const token = await signSessionToken(
    deps.config.sessionSecret,
    { userId: user._id, sessionId: session._id },
    session.expiresAt,
  );
  res.setHeader(
    'Set-Cookie',
    serialiseCookie(SESSION_COOKIE, token, {
      maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000),
      secure: false,
    }),
  );
  sendJson(res, 200, { user: { id: user._id, email: user.email, name: user.name } });
}

function paxApi(env: Record<string, string>): Plugin {
  const useAtlas = env.QUESTION_STORE === 'mongodb';
  const auth = resolveAuthDeps(env as NodeJS.ProcessEnv);
  const devEmail = (env.DEV_AUTH_EMAIL ?? '').trim().toLowerCase();

  const store =
    useAtlas && env.MONGODB_URI
      ? atlasQuestionStore(env.MONGODB_URI, env.MONGODB_DATABASE || 'pax')
      : null;

  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const request = toAuthRequest(req);
    if (!request.path.startsWith('/api/')) return next();

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie');

    if (auth instanceof AuthConfigError) {
      sendJson(res, 503, { error: `Auth is not configured: ${auth.message}` });
      return;
    }

    try {
      if (request.path === DEV_SIGN_IN_PATH) {
        if (!devEmail) {
          sendJson(res, 404, { error: 'Not found' });
          return;
        }
        if (request.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          sendJson(res, 405, { error: 'POST only' });
          return;
        }
        await devSignIn(auth, req, res, devEmail);
        return;
      }

      if (request.path.startsWith('/api/auth/')) {
        const result = await handleAuthRequest(auth, request);
        if (!result) {
          sendJson(res, 404, { error: 'Not found' });
          return;
        }
        for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
        res.statusCode = result.status;
        res.end(result.body === undefined ? undefined : JSON.stringify(result.body));
        return;
      }

      if (request.path !== '/api/questions') {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }

      const signedIn = await authenticate(auth, request);
      if (!signedIn) {
        sendJson(res, 401, { error: 'Sign in to read the question bank.' });
        return;
      }
      if (request.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        sendJson(res, 405, { error: 'GET only' });
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
        sendJson(res, 400, { error: 'Invalid pagination' });
        return;
      }

      if (useAtlas) {
        if (!store) {
          sendJson(res, 503, { error: 'MongoDB connection is not configured.' });
          return;
        }
        sendJson(res, 200, await store.query(params));
        return;
      }

      execFile(
        'python',
        [fileURLToPath(new URL('./scripts/query_questions.py', import.meta.url)), JSON.stringify(params)],
        { encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
        (error, stdout) => {
          if (error) {
            sendJson(res, 503, {
              error: 'The local question database is unavailable. Check Python and data/extraction/questions.sqlite.',
            });
            return;
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(stdout);
        },
      );
    } catch {
      sendJson(res, 503, { error: 'The service is temporarily unavailable.' });
    }
  };

  const attach = (server: { middlewares: { use: (fn: typeof middleware) => void }; httpServer?: { once: (event: string, fn: () => void) => void } | null }) => {
    server.middlewares.use(middleware);
    server.httpServer?.once('close', () => {
      void store?.close();
    });
  };

  return {
    name: 'pax-api',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    paxApi({ ...loadEnv(mode, process.cwd(), ''), ...process.env } as Record<string, string>),
  ],
}));
