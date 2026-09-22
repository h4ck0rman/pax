# Vercel deployment

Production: https://pax-eosin.vercel.app

The app shell and the policy pages are public, because the sign-in page is part
of the shell. Every question request requires a live session.

Pax uses one Vercel project: the Vite frontend, a Node function at
`/api/questions`, a catch-all function at `/api/auth/*`, and routing middleware
that closes every other API path to requests without a usable session token.
MongoDB Atlas holds the questions, the users and the sessions. No separate app
server or auth service is needed. Each function also authorises independently of
the middleware, so reaching one directly gains nothing.

## Required server settings

Set these in Vercel for both **Production** and **Preview**:

- `MONGODB_URI`: Atlas connection string (secret).
- `MONGODB_DATABASE`: `pax`.
- `SESSION_SECRET`: at least 32 random characters (secret). Changing it signs everyone out.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: from the Google OAuth client (the secret is secret).
- `ALLOWED_EMAILS` or `ALLOWED_DOMAIN`: who may sign in.
- `PUBLIC_ORIGIN`: `https://pax-eosin.vercel.app`, so the redirect URI does not depend on the request host.

Never set `DEV_AUTH_EMAIL` on a deployment; it enables a development-only
sign-in shim. Do not use `VITE_` prefixes, which would publish a value to the
browser. A missing or short `SESSION_SECRET`, or an empty allowlist, fails closed.

See [authentication](authentication.md) for the Google Cloud setup and the
session model.

## Deploy

```powershell
npm ci
npx vercel login
npx vercel link --yes --project pax
npm run build
npm run test:vercel-gate
```

Supply the environment variables in the Vercel dashboard, or explicitly authorize
uploading them from the ignored `.env` with `node scripts/configure_vercel.mjs`.
That script sends only the settings above, by standard input, without printing
their values, and refuses to upload the development shim setting. It updates
Production and Preview.

Then deploy:

```powershell
npx vercel --prod --yes
```

`vercel.json` configures Vite output, the functions, the security headers and a
rewrite so client-side paths such as `/terms` fall back to the shell. Neither the
frontend nor API responses are publicly cacheable. `.vercelignore` excludes
environment files, source documents, SQLite data, logs, and local tooling.

Atlas Network Access must allow traffic from the Vercel function environment.
If deployed API requests cannot reach Atlas, configure network access appropriate
to your Vercel plan; do not disable TLS or expose credentials in client code.
The deployed application needs read access to `questions` and read and write
access to `users` and `sessions`, so a read-only Atlas user is no longer enough.

**Deploying from Git.** `main` is the production branch, so any push to it
deploys to production. Never push an older commit to `main`: Vercel will build it
and replace what is live.

After deployment, verify that `/api/questions` returns 401 without a session,
that the sign-in page loads, and that signing in with an allowlisted Google
account reaches the test setup screen.

## Local development

`npm run dev` is a localhost-only development tool. It serves the same auth
routes, and with `DEV_AUTH_EMAIL` set it also exposes a sign-in shim so the app
and the browser tests work without Google. `npm run build && npm start` runs the
same session-protected server locally at http://localhost:3000 using `.env`.

References: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite),
[routing middleware](https://vercel.com/docs/routing-middleware/api).
