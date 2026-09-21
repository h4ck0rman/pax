# Pax

A calm study companion for Basic Physician Training. The web skeleton uses
React, TypeScript, and Vite. The three-colour palette is cream (`#F0EBD6`),
deep green (`#214539`), and a muted gold highlight (`#C5AD72`), with cream
dominating the layout and a green panel occupying roughly 30% of the workspace.

## Web application

For the minimal password-protected deployment, see [deployment setup](docs/deployment.md).
`npm start` serves the production app and API behind a shared password;
`npm run dev` is for local development only.

```powershell
npm install
npm run dev
```

Open http://127.0.0.1:5173. Use `npm run build` for a production build and
`npm run preview` to preview it locally.

The app opens directly onto a question. Only Question Bank and Practice Exams
are included. Search and pagination read actual questions from the local SQLite
database. Timed exams randomly select 5–50 questions; selections stay in memory
for the session and can be reviewed at the end. No scoring is fabricated: the
extracted bank does not contain verified answers.

The Vite server and preview server expose GET `/api/questions`. Set
`QUESTION_STORE=mongodb` in the ignored `.env` to use Atlas, or `sqlite` to
read `data/extraction/questions.sqlite` with Python. Only `structurally_clean`
candidates are served (5,374 in the current extraction); these are still
medically unreviewed. Credentials stay on the server. A static-only deployment
needs a separate backend. See [MongoDB setup](docs/mongodb.md) for migration,
configuration, verification, and switching back to SQLite.

Averia Libre is used throughout, with bold weights for the logo and headings.
Fonts load locally; see `public/fonts/README.md` for licensing.
Authentication and persistent user results are not implemented.

```powershell
npx playwright install chromium
npm run test:e2e
```

Browser tests cover actual database questions, search, selections, timed exams,
timer expiry, mobile layout, fonts, and database failure handling.

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
