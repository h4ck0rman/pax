import { next } from '@vercel/functions';
import { passwordAuthorized } from './server/password.js';

// No exclusions: HTML, APIs, assets, fonts, and unknown paths are all gated.
export const config = { matcher: '/:path*', runtime: 'nodejs' };

export default function middleware(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization' };
  if (!process.env.APP_PASSWORD || process.env.APP_PASSWORD.length < 16) {
    return new Response('Access is not configured.', { status: 503, headers });
  }
  if (!passwordAuthorized(request.headers.get('authorization') || '', process.env.APP_PASSWORD, process.env.APP_USERNAME || 'pax')) {
    return new Response('Password required.', { status: 401, headers: { ...headers, 'WWW-Authenticate': 'Basic realm="Pax", charset="UTF-8"' } });
  }
  return next({ headers });
}
