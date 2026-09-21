# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Pax is a study app for Basic Physician Training: a React/Vite frontend, a single
read-only `/api/questions` endpoint, and a Python-only pipeline that extracts
multiple-choice question candidates from local documents into SQLite and then
MongoDB Atlas. Every deployment path is password-gated with HTTP Basic auth.

## Commands

```powershell
npm install
npm run dev                  # localhost-only dev server, 127.0.0.1:5173, dev sign-in shim
npm run build                # tsc -b (typecheck) + vite build -> dist/ + tsc server -> dist-server/
npm run preview              # preview dist/ with the same /api/questions middleware
npm start                    # session-gated production server on :3000; needs build + .env
```

Tests:

```powershell
npx playwright install chromium
npm run test:e2e                                        # Playwright; auto-starts npm run dev
npx playwright test tests/app.spec.ts -g "mobile viewport"  # single browser test
npx playwright test --project=anonymous                 # only the signed-out specs
npm run build && npm run test:gate                      # auth gate for the npm start server
npm run test:vercel-gate                                # auth gate for middleware + Vercel functions
npm run build && node --test tests/auth.test.mjs        # session, token, cookie and OAuth unit tests
node scripts/init_auth_indexes.mjs                      # once per database
python -m unittest discover -s scripts -p test_extract_questions.py
python -m unittest discover -s scripts -p test_extract_questions.py -k test_word_list_numbering
```

`test:gate` and `tests/auth.test.mjs` read `dist/` and `dist-server/`, so a build
must run first.
`test:vercel-gate` compiles to `.tools/vercel-tests/` as part of its own script.
The extraction tests import `extract_questions` by bare name, so run them through
`unittest discover` (or from inside `scripts/`), not by dotted module path.

Data pipeline (each step is explicit and never modifies `resources/`):

```powershell
python -m pip install --target .tools/extraction -r requirements-extraction.txt
python scripts/extract_questions.py            # resources/ -> data/extraction/
python scripts/verify_extraction.py
python -m pip install --target .tools/mongodb -r requirements-mongodb.txt
python scripts/mongo_config.py                 # connection smoke test
python scripts/migrate_mongodb.py              # dry run
python scripts/migrate_mongodb.py --apply      # import + verify; --verify checks only
python scripts/verify_question_api.py          # compares a running dev server against SQLite
```

Deployment:

```powershell
node scripts/init_auth_indexes.mjs                              # once per database: users, sessions, tests
python scripts/generate_vine_art.py                             # redraw the sign-in artwork
node scripts/configure_vercel.mjs https://pax-eosin.vercel.app  # upload settings; origin is an argument
node scripts/verify_deployment.mjs https://pax-eosin.vercel.app # check the live posture, signing nobody in
```

`configure_vercel.mjs` takes the deployment origin as an argument and refuses
anything that is not `https`, because `PUBLIC_ORIGIN` in `.env` is the local
development origin and must never be uploaded. It also refuses to upload
`DEV_AUTH_EMAIL`.

`verify_deployment.mjs` checks the posture rather than signing in: the shell,
assets and policies are public; question paths answer 401 and leak no questions
or counts; forged and unsigned cookies are refused; the sign-in redirect carries
PKCE, state and nonce and points at that deployment's own callback; the in-flight
cookie is `HttpOnly`, `SameSite=Lax` and `Secure`; and the headers are present.

Python dependencies are vendored per tool directory under `.tools/`, and the
scripts prepend that directory to `sys.path` themselves. There is no virtualenv.

## Architecture

**One data endpoint, four implementations.** `GET /api/questions` accepts `search`,
`offset`, `limit`, `random` and returns `{ total, questions[] }`. The same
contract is implemented separately in `vite.config.ts` (dev and preview),
`server/production.ts` (`npm start`), `api/questions.ts` (Vercel function), and
`scripts/query_questions.py` (SQLite backend). Changing the query shape,
validation bounds, or response fields means editing all of them, plus the browser
client in `src/questions/api.ts`, which is the fifth copy and validates the
response shape before it reaches React.

**Two question stores.** `QUESTION_STORE=sqlite` makes the Vite plugin shell out
to Python against `data/extraction/questions.sqlite`; `mongodb` uses the shared
Atlas pool in `server/question-store.ts`. Production and Vercel are Atlas-only.
Store failures return 503 with a generic message rather than falling back to the
other store. Only `structural_status = 'structurally_clean'` rows are ever
served: 5,374 of 22,947 candidates in the current extraction.

**Auth is Google sign-in with server-side sessions.** `server/auth/` holds it
all: `config.ts` reads and validates settings, `google.ts` does the OAuth
exchange and verifies Google's identity token, `tokens.ts` signs and verifies the
session token and serialises cookies, `store.ts` keeps users and sessions in
MongoDB, and `routes.ts` holds transport-free handlers plus the one
`authenticate()` gate. Adapters are thin: `server/auth/vercel.ts` for Vercel,
`server/production.ts` for the Node server, and `vite.config.ts` for development.
Read `docs/authentication.md` before changing any of it.

Each `/api/auth` route is its own file re-exporting the Vercel adapter, which
dispatches on the request path. Do not replace them with a catch-all: on Vercel a
catch-all only matched one path segment, so `/api/auth/me` resolved while
`/api/auth/google/start` returned Vercel's own 404 and sign-in could not start. A
gate test asserts all four routes resolve to the same adapter.

**The security model, which the gate tests enforce.** The app shell and
`/terms` and `/privacy` are public, because the sign-in page is part of the
shell. Everything else under `/api` requires a live session. `middleware.ts` is a
cheap perimeter that only checks the signature and expiry, with no database call;
every function performs the authoritative check itself, including whether the
session was revoked, so middleware is never the only gate. A missing or short
`SESSION_SECRET`, or an empty allowlist, answers 503 rather than opening up. An
empty allowlist is treated as misconfiguration, never as "allow anyone".

**`PUBLIC_ORIGIN` decides two security properties, and no request header may.**
It is required whenever a Google client is configured, and startup fails without
it. It pins the OAuth redirect URI, so no `Host` header can influence where Google
sends an authorization code, and it decides whether cookies carry `Secure` and
whether HSTS is sent. Never derive either from a request. `NODE_ENV` in
particular is not a signal: nothing in this project sets it, so inferring
transport from it silently issued cookies without `Secure`. Where a header is the
only fallback, read the **last** `X-Forwarded-Proto` value, because proxies append
and the first entry is whatever the client sent.

**Sessions are revocable.** The token carries only a user id and a session id,
never an email or a name, and every protected request looks the session record
up. Signing out revokes the record, so a stolen cookie stops working immediately.
Sessions slide forward while in use, capped by an absolute ceiling that is never
extended. Keep both properties: do not trust the token alone, and do not put
personal detail in it.

**The development sign-in shim.** `vite.config.ts` exposes
`POST /api/auth/dev-sign-in` when `DEV_AUTH_EMAIL` is set, which mints a real
session without Google so the app and the browser tests work locally. It lives in
the Vite config specifically because that file is never deployed. Never move this
logic into `api/` or `server/`, and never set `DEV_AUTH_EMAIL` on a deployment.

**Build outputs.** `tsconfig.json` is typecheck-only across `src`, `server`,
`api`, and `middleware.ts`. `tsconfig.server.json` emits `dist-server/` for
`npm start`. Vercel builds `dist/` and bundles `api/` itself.

**Extraction pipeline.** `scripts/extract_questions.py` is deterministic,
offline, and regex-driven; a rerun rebuilds `data/extraction/` from scratch,
reusing cached text when the source hash and the `VERSION` constant match. Bump
`VERSION` when parsing changes so caches invalidate. SQLite holds `documents`,
`questions`, `options`, `occurrences`; question IDs are content hashes, which is
what makes the Atlas import idempotent and resumable. `migrate_mongodb.py`
inserts missing IDs only and stops on any content mismatch instead of
overwriting a record that may carry manual review status.

## Constraints that matter

- The bank has **no verified answer keys**. Never compute scores, mark options
  correct, or infer answers from source highlighting. Record what the user
  selected and say plainly that scoring is unavailable. Every candidate is
  `unreviewed`, and `structurally_clean` is a parsing result, not a medical one.
- No document content or question text goes to an LLM or any external API. The
  extraction and migration paths are local by design.
- `resources/`, `data/`, `.tools/`, `dist*`, and all `.env*` files are ignored by
  Git and excluded from Vercel uploads. Treat `data/extraction/` as regenerable
  staging output, not a source of truth to hand-edit.
- `MONGODB_URI`, `SESSION_SECRET` and `GOOGLE_CLIENT_SECRET` are server-only.
  Never add a `VITE_` prefix to a secret, and never tell the browser which
  setting is missing.
- Pass anything unexpected through `describeError` from `server/log.ts` before
  logging it. MongoDB errors quote the connection string, credentials included,
  so logging a raw cause puts them in the deployment's logs.
- Two allowlists gate sign-in and you need both. Google's **test users** list
  decides whose account may pass the consent screen; `ALLOWED_EMAILS` decides whom
  Pax admits afterwards. An address in only one of them fails, in different ways.
- Browser tests run in three Playwright projects: `setup` mints a session,
  `anonymous` runs `*.anon.spec.ts` with no session, and `signed-in` runs the
  rest with a shared session. A test that signs out must mint its own session
  first, or it revokes the one every parallel spec is using.
- Palette is exactly three colours, declared as tokens in
  `src/styles/tokens.css`: cream `#F0EBD6` ground, green `#214539` ink, white
  `#FFFFFF` surfaces. There is no accent colour, and an earlier gold accent was
  removed deliberately. Use the tokens rather than raw hex values.
- Averia Libre is self-hosted from `public/fonts/`. The strict
  Content-Security-Policy allows only `'self'`, so remote fonts, CDNs, and inline
  scripts will be blocked.
- Playwright only matches `**/*.spec.ts`. The `*.test.mjs` gate suites run under
  `node --test`, and Playwright crashes if it tries to load them.
- Question stems legitimately contain words like "incorrect" and "score", so
  never assert on the whole card when testing that Pax does not mark answers.
  Assert on the copy Pax itself writes, and on the absence of marking elements.

## Frontend state

The frontend was rebuilt from an empty shell on the `rebuild/shell` branch and is
being grown one feature at a time. Design tokens, element defaults, shell layout,
and each feature's styles are separate files under `src/styles/`, imported in
that order from `index.css`. Features add a stylesheet rather than extending the
shell rules.

**Question bank.** `src/questions/QuestionBank.tsx` owns data and navigation;
`QuestionBox.tsx` is presentational and takes the question, position, selection,
submitted flag, and a navigation slot as children. The bank opens on the first
question, and every later draw is random, so the on-screen number is how many
questions this session has shown, not an index into the bank.

Drawn questions accumulate in a session history. `{ entries, index }` is one
state value so appending a draw and moving to it stays a single pure update, and
Previous walks back while Next replays the history before drawing anything new. A
request carries a nonce, and the last applied nonce is held in a ref, so a
StrictMode double-invoked effect cannot append the same draw twice and a retry
still refetches.

Submit commits the selection for the current question and locks its options. They
use `aria-disabled` rather than `disabled`, so a reader can still focus them to
review a choice. Playwright treats `aria-disabled` as not clickable, so a test
that needs to prove the handler ignores a click must use `dispatchEvent('click')`
instead of `click()`.

**Practice test.** `src/practice/` holds a three phase feature: `TestSetup`
curates a sitting by question count and minutes, `PracticeTest` runs it, and
`TestReview` ends it. `TestBar` is the command bar above the card during a
sitting, carrying the countdown, progress, pause and stop. `QuestionBox` is
reused for each question, which is why its right-hand label is a `count` prop
rather than a hard-coded bank size.

The countdown is `{ remainingMs, runningSince }`. A null `runningSince` means
paused, so paused time never counts against the candidate, and `usedSeconds` on
the completed test is derived from the clock rather than from wall-clock
timestamps. The effect reads the live values through a ref so answering a
question does not restart the timer. Browser tests drive it with
`page.clock.install()` and `fastForward`, which makes expiry deterministic.

**Grading happens outside Pax.** `src/practice/export.ts` builds one Markdown
document holding every question, its options, the candidate's answer, the source,
and instructions asking a language model to supply the correct option. Copy for
LLM writes it to the clipboard, falling back to a selectable textarea when
clipboard access is refused; Export test downloads the same text as a `.md` file.
Never add scoring to this path: the document must ask for the answer, never assert
one. Revoke the blob URL on a later tick, since revoking in the same tick can
cancel the download.

**Past tests.** `server/history/` is the past tests feature, not the automated
test suite in `tests/`. A sitting is stored with its questions copied in, not
referenced, so a record of what someone was asked never changes when the bank is
rebuilt. The collection is `tests`, indexed on `{ userId, finishedAt }`.

`GET /api/tests` lists a page of summaries, `GET /api/tests?id=...` returns one
sitting, and `POST /api/tests` keeps one. There is no dynamic route segment: an id
is a query parameter, deliberately, because a catch-all file already proved
unreliable on Vercel. The browser generates the sitting id, so a retried save
replaces the record rather than adding a row. Every read and write is scoped to
the signed-in user, and someone else's id is answered 404 rather than 403, so ids
cannot be probed. The server sets `finishedAt` itself, so a browser cannot
backdate a sitting.

`server/history/routes.ts` validates the whole upload, because it is the only
endpoint that accepts a body: sizes and ranges on every field, and a selection
must name one of that question's own options. Keep it that way, and keep
`readTest` the single entry point.

**The review screen is shared.** `TestReview` renders both a paper just finished
and one from history, showing every option with the chosen one marked and nothing
about correctness. `toCompletedTest` in `src/history/api.ts` reshapes a stored
sitting into the value the review screen and the exporter already understand, so
there is one export path rather than two.

**Section navigation collapses rather than crowding.** `src/shell/AppNav.tsx` is a
row on a wide screen and a menu on a narrow one, so adding a section costs no
horizontal room. Extend the `SECTIONS` list in `src/App.tsx` and nothing else.
`src/shell/AccountMenu.tsx` is the profile bubble: the account and the way out
live behind it, which is why the header no longer carries a labelled sign-out
button. A browser test that signs out must open the bubble first.

**Navigation is deliberately stacked and quiet.** Submit is the only control
styled as a button, full width on its own line. Back and Next sit beneath it as
underlined links and must always share one line at every width, down to 320px, so
nothing in `.nav-steps` may wrap. A layout test asserts both the stacking and the
shared line. Back and Next are still `<button>` elements because they act rather
than navigate; only their styling is link-like. Error messages render above the
whole row, never inside it, so a message cannot disturb the arrangement.

**Extracted text needs collapsing.** Around 70% of stems carry the source PDF's
hard line wraps, up to ten per stem. `src/questions/text.ts` collapses single
newlines so the browser controls line length, and keeps blank lines as real
paragraph breaks. Render stems through it, never raw.

**Two signed-out pages.** `/` is `src/landing/LandingPage.tsx`: a hero that is
itself the artwork, with the internal header sitting on the green and sign-in as
the only control above the fold, then cream sections and a footer. `/login` is
`src/auth/LoginPage.tsx`: a full-height split with the vine panel beside the
column that holds the Google button. Both replace the app shell rather than
sitting inside it.

Google's mark appears only on the control that actually starts Google sign-in,
which is on `/login`. The landing page links to `/login` instead, and a failed
sign-in redirects to `/login?error=...` so the reader lands on the button. That
redirect target is `SIGN_IN_PAGE` in `server/auth/routes.ts`.

`src/auth/VineArt.tsx` is generated by `scripts/generate_vine_art.py`. Do not edit
the component; change the generator's density, leaf size or `SEED` and rerun it.
The artwork is inline SVG using `currentColor`, so it stays in the palette, costs
no request, and does not need the Content-Security-Policy to allow external or
data-URI images. `src/auth/GoogleMark.tsx` is the one deliberate exception to the
three-colour palette: Google's branding requires their mark unaltered and in full
colour.

**Routing is four cases, with no router.** `src/App.tsx` reads
`window.location.pathname`: `/terms` and `/privacy` are public pages; when signed
out, `/login` is the sign-in page and anything else is the landing page; when
signed in, it shows the app. Client-side paths need a fallback to the shell, which `vercel.json` provides
as a rewrite and `server/production.ts` as an in-memory lookup that still 404s
anything looking like a file.

The pre-rebuild question bank and practice exam UI is not deleted, only retired:
recover it from the `pre-rebuild-baseline` tag or the `backup/pre-rebuild`
branch, for example `git show pre-rebuild-baseline:src/App.tsx`.

## Docs

`docs/authentication.md` covers Google sign-in, sessions, the settings, and the
Google Cloud setup. `docs/deployment.md` covers the Vercel project, required
environment variables, and verification. `main` is Vercel's production branch, so
pushing an older commit to it will deploy that commit over production. `docs/mongodb.md` covers Atlas collections, import, and
switching back to SQLite. `data/extraction/report.md` records extraction results
and known gaps once the pipeline has run.
