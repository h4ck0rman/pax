# Authentication

Pax signs people in with Google and keeps them signed in with a session cookie.
There are no passwords in Pax, and no password to store or reset.

## How it works

1. The sign-in page is part of the app shell, so the shell, `/terms` and
   `/privacy` are public. Everything under `/api` except `/api/auth/*` requires a
   live session.
2. `GET /api/auth/google/start` generates a `state`, a `nonce` and a PKCE
   verifier, keeps them in a short-lived signed cookie, and redirects to Google.
3. Google returns to `GET /api/auth/google/callback`. Pax checks `state` against
   the cookie, exchanges the code with the PKCE verifier and the client secret,
   then verifies Google's identity token against Google's published keys,
   including issuer, audience, nonce and `email_verified`.
4. The verified address must appear in the allowlist. If it does not, no session
   is created.
5. Pax records the user and a session, then sets `pax_session`: a signed token
   holding only the user id and the session id, in an `HttpOnly` cookie.
6. Every protected request verifies the signature **and** looks the session up.
   Signing out revokes the record, so a stolen cookie stops working immediately
   rather than at expiry.

Sessions last 12 hours and slide forward while in use, with a hard ceiling of 7
days that is never extended. Expired records are removed by a MongoDB index.

## Settings

| Setting | Required | Purpose |
| --- | --- | --- |
| `SESSION_SECRET` | yes | Signs session tokens. At least 32 characters. Changing it signs everyone out. |
| `GOOGLE_CLIENT_ID` | to sign in | OAuth client id. |
| `GOOGLE_CLIENT_SECRET` | to sign in | OAuth client secret. |
| `ALLOWED_EMAILS` | one of these | Comma-separated addresses permitted to sign in. |
| `ALLOWED_DOMAIN` | one of these | A single domain permitted to sign in, without the at sign. |
| `PUBLIC_ORIGIN` | with Google | The origin this deployment is reached on, such as `https://pax-eosin.vercel.app`. Pins the redirect URI and decides whether cookies carry `Secure`. |
| `MONGODB_URI`, `MONGODB_DATABASE` | yes | Where users, sessions and questions live. |

With neither `ALLOWED_EMAILS` nor `ALLOWED_DOMAIN`, Pax refuses every sign-in.
It never treats an empty allowlist as "allow anyone". A missing or short
`SESSION_SECRET` makes protected routes answer 503 rather than opening up.

`PUBLIC_ORIGIN` is required whenever a Google client is configured, and startup
fails without it. Two things depend on it, and neither may come from a request
header: the redirect URI handed to Google, and whether session cookies carry
`Secure`. An `https` origin means cookies are issued `Secure` and HSTS is sent.

**Two allowlists, and you need both.** Google's **test users** list decides whose
Google account may pass the consent screen. `ALLOWED_EMAILS` decides whom Pax
admits. Adding an address in Google alone gets you as far as
"That account does not have access to this question bank".

Run the index setup once per database:

```powershell
node scripts/init_auth_indexes.mjs
```

## Setting up the Google OAuth client

1. Open <https://console.cloud.google.com> and create a project, for example
   `pax`.
2. Go to **APIs & Services → OAuth consent screen**.
   - **User type**: choose **Internal** if everyone signing in is in your Google
     Workspace organisation, which avoids Google's review entirely. Otherwise
     choose **External**.
   - Fill in the app name, your support email and a developer contact address.
   - **Scopes**: add only `openid`, `.../auth/userinfo.email` and
     `.../auth/userinfo.profile`. These are non-sensitive, so Google does not
     require app verification.
   - **Privacy policy URL**: `https://YOUR-DOMAIN/privacy`
   - **Terms of service URL**: `https://YOUR-DOMAIN/terms`
   - Leave **Publishing status** as **Testing** and add each person as a **Test
     user**, up to 100. In testing mode Google shows an "unverified app" notice
     but no review is needed, which suits a closed study group.
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client
   ID**.
   - **Application type**: Web application.
   - **Authorised redirect URIs**, added exactly, one per environment:
     - `https://YOUR-DOMAIN/api/auth/google/callback`
     - `http://127.0.0.1:5173/api/auth/google/callback` for local development
   - Google accepts plain HTTP only for `localhost` and `127.0.0.1`.
   - Create it, then copy the client id and client secret.
4. Put the client id and secret into the environment, along with
   `SESSION_SECRET`, the allowlist and `PUBLIC_ORIGIN`. For Vercel:

   ```powershell
   node scripts/configure_vercel.mjs
   ```

   That script uploads only the settings Pax needs, from the ignored `.env`,
   without printing their values.

### Three things that catch people out

- **Use a separate OAuth client for local development.** Registering
  `http://127.0.0.1:5173/api/auth/google/callback` on the production client means
  the production client will accept a redirect to the developer's own machine.
  Pax no longer derives the redirect URI from the request host, so this is not
  exploitable, but a second client keeps the production client's registered set
  to production only.
- **Authorised domains and `vercel.app`.** Publishing an External consent screen
  makes Google ask for an authorised domain you control. Google will not accept
  `vercel.app`, because it is a shared suffix. Staying in **Testing** avoids
  this. Publishing needs a custom domain.
- **Preview deployments.** Every Vercel preview gets its own hostname, and each
  redirect URI must be registered in advance, so sign-in will not work on an
  unregistered preview. Set `PUBLIC_ORIGIN` to your production origin, and use
  the development shim below for local work.

## Do we need terms and a privacy policy?

For a closed group in **Testing** mode with only these non-sensitive scopes,
Google does not require app verification, so you can operate without published
policies. The consent screen form still has fields for them, and both become
required once you publish. Pax ships both pages anyway, at `/terms` and
`/privacy`, reachable without signing in so that a reader, and a Google
reviewer, can read them first. Read them and correct anything that does not match
how you actually run the deployment.

## Local development and tests

Google's redirect cannot reach a machine that is not registered, and the browser
tests cannot complete a real Google sign-in. Setting `DEV_AUTH_EMAIL` makes the
Vite dev and preview servers expose `POST /api/auth/dev-sign-in`, which mints a
real session for that address without Google.

This shim lives in `vite.config.ts` on purpose. That file is never part of a
deployment, so the route cannot exist in production. The address must still pass
the allowlist. Never set `DEV_AUTH_EMAIL` on a deployment.

```powershell
# .env, for development only
SESSION_SECRET=<a long random value>
ALLOWED_EMAILS=dev@pax.local
DEV_AUTH_EMAIL=dev@pax.local
```

## Removing access

- **One session**: the person signs out, or delete their `sessions` record.
- **One person**: remove their address from the allowlist. Access ends at their
  next request, because every protected request rechecks the allowlist. Delete
  their `users` and `sessions` records to remove their data.
- **Everyone**: change `SESSION_SECRET`, which invalidates every token at once.

## Verifying a deployment

```powershell
node scripts/verify_deployment.mjs https://pax-eosin.vercel.app
```

That script checks the posture without signing in: the shell, assets and policies
are public; every question path answers 401 without a session and leaks no
questions or counts; forged and unsigned cookies are refused; the sign-in redirect
carries PKCE, `state` and `nonce`, and points at this deployment's own callback;
the in-flight cookie is `HttpOnly`, `SameSite=Lax` and `Secure`; a mismatched
state sets no session; and the security headers are present.
