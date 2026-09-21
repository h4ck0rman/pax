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
npx playwright test tests/app.spec.ts -g "timed exam"   # single browser test
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
validation bounds, or response fields means editing all of them, plus the
`Question` type in `src/App.tsx`. The frontend is the only consumer.

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
  correct, or infer answers from source highlighting. The UI deliberately shows
  selections and a "no score is calculated" note instead.
- No document content or question text goes to an LLM or any external API. The
  extraction and migration paths are local by design.
- `resources/`, `data/`, `.tools/`, `dist*`, and all `.env*` files are ignored by
  Git and excluded from Vercel uploads. Treat `data/extraction/` as regenerable
  staging output, not a source of truth to hand-edit.
- `MONGODB_URI` and `APP_PASSWORD` are server-only. Never add a `VITE_` prefix to
  a secret, and never log connection strings or raw driver errors.
- Palette is exactly three colours, defined as CSS variables in `src/styles.css`:
  cream `#F0EBD6`, green `#214539`, gold `#C5AD72`. Averia Libre is self-hosted
  from `public/fonts/`; the strict Content-Security-Policy allows only `'self'`,
  so remote fonts, CDNs, and inline scripts will be blocked.
- `src/App.tsx` and `src/styles.css` are written in a deliberately dense
  single-file style with long lines. Match the surrounding formatting rather than
  reflowing it.

## Docs

`docs/deployment.md` covers the Vercel project, required environment variables,
and verification. `docs/mongodb.md` covers Atlas collections, import, and
switching back to SQLite. `data/extraction/report.md` records extraction results
and known gaps once the pipeline has run.
