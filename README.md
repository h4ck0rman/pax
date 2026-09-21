# Pax

A calm study companion for Basic Physician Training. The web skeleton uses
React, TypeScript, and Vite. The three-colour palette is a cream ground
(`#F0EBD6`), deep green ink (`#214539`), and white surfaces (`#FFFFFF`), with no
accent colour. Values are declared as tokens in `src/styles/tokens.css`.

## Web application

For the deployment, see [deployment setup](docs/deployment.md) and
[authentication](docs/authentication.md). `npm start` serves the production app
and API with Google sign-in; `npm run dev` is for local development only.

```powershell
npm install
npm run dev
```

Open http://127.0.0.1:5173. Use `npm run build` for a production build and
`npm run preview` to preview it locally.

The frontend is being rebuilt feature by feature from an empty shell. Question
Bank is in: it opens on the first question in the bank and draws a random one
each time you choose Next. Back walks back through the questions already
drawn, keeping each one's selection. Submit commits an answer and locks that
question's options.

Practice Test is in too. Choose a question count and a time limit, then sit the
paper against a countdown. A command bar above the question shows the time left,
how far through you are and how many you have answered, and lets you pause, which
stops the clock and hides the question, or stop, which ends the sitting. Running
out of time ends it automatically. At the end, Copy for LLM puts the whole paper
on the clipboard and Export test downloads it as Markdown, each containing every
question, its options, your answer and instructions for a language model to grade
it.

Nothing is marked correct and nothing is scored anywhere in Pax, because the
bank has no verified answer keys. A session is held in memory only. Design
tokens, element defaults, shell layout, and feature styles live in separate files
under `src/styles/`. The earlier question bank and practice exam interface is
retired rather than deleted, and is recoverable from the `pre-rebuild-baseline`
tag.

The Vite server and preview server expose GET `/api/questions`. Set
`QUESTION_STORE=mongodb` in the ignored `.env` to use Atlas, or `sqlite` to
read `data/extraction/questions.sqlite` with Python. Only `structurally_clean`
candidates are served (5,374 in the current extraction); these are still
medically unreviewed. Credentials stay on the server. A static-only deployment
needs a separate backend. See [MongoDB setup](docs/mongodb.md) for migration,
configuration, verification, and switching back to SQLite.

Averia Libre is used throughout, with bold weights for the logo and headings.
Fonts load locally; see `public/fonts/README.md` for licensing.

Access is by Google sign-in, limited to an allowlist of addresses. Pax stores no
passwords, asks Google only for a name and an email address, and keeps the
session in a cookie that scripts cannot read. Signing out revokes the session on
the server. The shell and the `/terms` and `/privacy` pages are public so the
sign-in page can load; every question request needs a live session. See
[authentication](docs/authentication.md) for the Google Cloud setup. Test results
are still held in memory only and are not saved per user.

```powershell
npx playwright install chromium
npm run test:e2e
```

Browser tests cover the shell, the question box, and the bank: real database
questions, the palette and locally loaded fonts, line-wrap collapsing, single
selection, opening on question 1 and drawing randomly after that, walking back
and forward through a session without refetching, submitting and locking an
answer, restarting from the nav, database failures and recovery, and the
navigation layout holding down to a 320px viewport. The practice test suite drives
a deterministic clock to cover setup, the command bar, pause excluding its own
time, stop, expiry, and both export routes. Separate projects cover the signed-out
case: the sign-in page, the public policy pages, forged cookies, and the sign-in
redirect. Playwright
matches only `**/*.spec.ts`; the `*.test.mjs` auth gate suites run under
`node --test` through `npm run test:gate` and `npm run test:vercel-gate`.

## Question extraction

Python-only extraction of multiple-choice question candidates from the local
`resources/` export. No document content is sent to an LLM or external API.

## Run

```powershell
python -m pip install --target .tools/extraction -r requirements-extraction.txt
python scripts/extract_questions.py
python -m unittest discover -s scripts -p test_extract_questions.py
python scripts/verify_extraction.py
```

The existing `scripts/audit_resources.py` inventories files and samples PDF text;
`scripts/extract_questions.py` reads all PDF pages and extracts question candidates.
The extraction command supports `--resources PATH` and `--output PATH`.

## Outputs

See `data/extraction/report.md` for results and limitations, and `files.csv` for
every file's status. `files.json` includes detailed metadata and low-text page
numbers. Archive members have source paths such as `archive.zip!/paper.docx`.
The original top-level export ZIPs are skipped because their expanded folders
are already present; nested document ZIPs are processed in memory.

`questions.sqlite` contains `documents`, `questions`, `options`, and `occurrences`.
The last table retains each candidate's source location and original number.
`questions.jsonl` and `occurrences.jsonl` provide equivalent inspectable exports.
`documents/` retains extracted blocks, including separate speaker notes.

This is a **generated staging bank**, not the application's database. A rerun
rebuilds its database and reports, reusing cached text when the source hash and
extractor version match. Store manual reviews elsewhere or use a different
output directory before rerunning. Source files are never modified.

## Scope and quality

- PDF, DOCX, PPTX, TXT, JSON, XLSX, and ODT readers are included.
- DOCX parsing reads direct/inherited list properties, common numbering formats,
  list starts and overrides. Exotic restart/style semantics still need review.
- Legacy DOC/PPT files are deferred until a converter is available. OCR, images,
  videos, and Anki imports are deferred.
- Questions must have a stem and at least two sequential A–E options to become
  candidates. Unlabelled, inline, matching, free-response, and unusual layouts
  can be missed. `no_questions_detected` does not mean there are no questions.
- JSON text values are retained with paths; structured question objects need a
  schema-specific adapter for reliable import.
- Exact normalized stem-and-options matches are deduplicated. Near duplicates
  and reordered choices are not merged.
- `structurally_clean` means no implemented structural warning fired. It is not
  a correctness or completeness guarantee. All candidates are `unreviewed`.
- Option highlights are retained as source metadata, never interpreted as a
  correct answer. No medical answers or rationales are generated.
- Low-text pages may be blank, scanned, or graphical. They are reported rather
  than automatically classified as requiring OCR.

All source documents and generated datasets are ignored by Git.
