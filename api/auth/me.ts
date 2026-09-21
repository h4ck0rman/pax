// Thin route file. All four /api/auth routes share one adapter, which dispatches
// on the request path. Explicit files, because a catch-all did not reliably
// match nested paths on Vercel.
export { default } from '../../server/auth/vercel.js';
