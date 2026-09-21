# Vercel deployment

Production: https://pax-eosin.vercel.app

The deployed app has been verified to reject anonymous requests to pages, API,
fonts, and JavaScript, and to serve 5,374 Atlas questions after authentication.

Pax uses one Vercel project: the Vite frontend, a Node function at
`/api/questions`, and routing middleware that password-protects every path.
MongoDB Atlas remains the database. No separate app server or auth service is
needed. The API also validates the password independently of middleware.

## Required server settings

Set these in Vercel for both **Production** and **Preview**:

- `MONGODB_URI`: Atlas connection string (secret).
- `MONGODB_DATABASE`: `pax`.
- `APP_USERNAME`: `pax`.
- `APP_PASSWORD`: a separate strong application password of at least 16 characters (secret).

Do not use `VITE_` prefixes. Missing or short passwords fail closed. The browser
uses its native login prompt. Basic authentication does not provide a reliable
cross-browser logout button; use a private window for an isolated session.

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
That script sends only the four settings above, by standard input, without
printing their values. It updates Production and Preview settings.

Then deploy:

```powershell
npx vercel --prod --yes
```

`vercel.json` configures Vite output and the function. `middleware.ts` matches
all paths, including assets and fonts, before serving content. Neither the
frontend nor API responses are publicly cacheable. `.vercelignore` excludes
environment files, source documents, SQLite data, logs, and local tooling.

Atlas Network Access must allow traffic from the Vercel function environment.
If deployed API requests cannot reach Atlas, configure network access appropriate
to your Vercel plan; do not disable TLS or expose credentials in client code.
Prefer a read-only Atlas user scoped to `pax` for the deployed application.

After deployment, verify that the homepage, assets, and API return 401 without
credentials, and the authenticated API returns the expected question count.
Rotating the password requires updating the Vercel secret and redeploying.

## Local development

`npm run dev` remains a localhost-only development tool, without the password
gate. `npm run build && npm start` provides a separate password-protected local
production preview at http://localhost:3000 using `.env`.

References: [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite),
[routing middleware](https://vercel.com/docs/routing-middleware/api).
