import { next } from '@vercel/functions';
import { SESSION_COOKIE, readCookie, verifySessionToken } from './server/auth/tokens.js';

export const config = { matcher: '/:path*', runtime: 'nodejs' };

/** The app shell is public, because the sign-in page is part of it. Everything
 *  under /api is closed except the sign-in routes themselves. */
const PUBLIC_API_PREFIX = '/api/auth/';

/** A cheap perimeter: signature and expiry only, with no database call, so a
 *  request without a usable token never reaches a function. The functions still
 *  perform the authoritative check, including whether the session was revoked.
 *  This layer is defence in depth and is never the only gate. */
export default async function middleware(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  const { pathname } = new URL(request.url);

  if (!pathname.startsWith('/api/') || pathname.startsWith(PUBLIC_API_PREFIX)) {
    return next({ headers });
  }

  const secret = (process.env.SESSION_SECRET ?? '').trim();
  if (secret.length < 32) {
    return Response.json({ error: 'The service is not configured.' }, { status: 503, headers });
  }

  const token = readCookie(request.headers.get('cookie') ?? undefined, SESSION_COOKIE);
  const claims = token
    ? await verifySessionToken(new TextEncoder().encode(secret), token)
    : null;

  if (!claims) {
    return Response.json({ error: 'Sign in to continue.' }, { status: 401, headers });
  }

  return next({ headers });
}
