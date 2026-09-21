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
npm run dev                  # localhost-only dev server, 127.0.0.1:5173, no password gate
npm run build                # tsc -b (typecheck) + vite build -> dist/ + tsc server -> dist-server/
npm run preview              # preview dist/ with the same /api/questions middleware
npm start                    # password-gated production server on :3000; needs build + .env
```

Tests:

```powershell
npx playwright install chromium
npm run test:e2e                                        # Playwright; auto-starts npm run dev
npx playwright test tests/app.spec.ts -g "mobile viewport"  # single browser test
npm run build && npm run test:gate                      # auth gate for the npm start server
npm run test:vercel-gate                                # auth gate for middleware + Vercel function
python -m unittest discover -s scripts -p test_extract_questions.py
python -m unittest discover -s scripts -p test_extract_questions.py -k test_word_list_numbering
```

`test:gate` reads `dist/` and `dist-server/`, so a build must run first.
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
node scripts/verify_deployment.mjs https://...  # live deployment auth + question count
```

Python dependencies are vendored per tool directory under `.tools/`, and the
scripts prepend that directory to `sys.path` themselves. There is no virtualenv.

## Architecture

**One endpoint, four implementations.** `GET /api/questions` accepts `search`,
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

**Auth fails closed everywhere.** `server/password.ts` holds the constant-time
Basic-auth check shared by `middleware.ts` and `api/questions.ts`;
`server/production.ts` repeats it inline because it runs before any routing.
A missing `APP_PASSWORD`, or one under 16 characters, yields 401/503 rather than
open access. The Vercel matcher is `/:path*` with no exclusions, so HTML, API,
assets, and fonts are all gated, and the function re-checks independently of the
middleware. The gate tests assert that unauthenticated requests never reach the
store. Keep that property when touching either path.

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
- `MONGODB_URI` and `APP_PASSWORD` are server-only. Never add a `VITE_` prefix to
  a secret, and never log connection strings or raw driver errors.
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

The previous question bank and practice exam UI is not deleted, only retired:
recover it from the `pre-rebuild-baseline` tag or the `backup/pre-rebuild`
branch, for example `git show pre-rebuild-baseline:src/App.tsx`. The server, API,
auth, and extraction pipeline were untouched by the reset.

## Docs

`docs/deployment.md` covers the Vercel project, required environment variables,
and verification. `docs/mongodb.md` covers Atlas collections, import, and
switching back to SQLite. `data/extraction/report.md` records extraction results
and known gaps once the pipeline has run.
