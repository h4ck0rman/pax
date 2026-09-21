# MongoDB Atlas

The `pax` database contains three collections:

| Collection | Content |
| --- | --- |
| `questions` | Stems, embedded options, primary source, extraction flags and review status |
| `documents` | Every source file's extraction status and metadata |
| `occurrences` | Every question occurrence, original numbering and source location |

Question IDs are the existing SQLite content hashes. Source documents and
occurrences also have deterministic IDs. The importer inserts missing IDs and
never overwrites or deletes existing records. It can resume an interrupted run.
Verification compares all imported content against SQLite, except mutable
review status. If an existing record differs, verification stops without
overwriting it. Source edits require an explicit reconciliation, not an automatic
replacement of reviewed content.

## Configuration

Copy `.env.example` to `.env` and set `MONGODB_URI` and `MONGODB_DATABASE=pax`.
The database user needs read/write access to `pax` for import; the app itself
only reads. In Atlas Network Access, allow the IP of the machine running Pax.
Use a read-only database user for the app after migration if desired.

The URI is server-only. Never prefix it with `VITE_`, put it in frontend source,
or commit it. `.env` is ignored by Git. If you rotate a password in Atlas, update
`.env` and restart `npm run dev`.

## Import and verification

```powershell
python -m pip install --target .tools/mongodb -r requirements-mongodb.txt
python scripts/mongo_config.py
python scripts/migrate_mongodb.py
python scripts/migrate_mongodb.py --apply
```

Without `--apply`, the command is a local dry-run. The apply command imports
and then verifies all three collections. `--verify` checks an existing import
without writing. The result is saved in `data/mongodb/migration-report.json`.
No medical answers are generated during import.

## Run the app

Set `QUESTION_STORE=mongodb` in `.env`, then run `npm run dev`. The existing
`/api/questions` endpoint uses a shared MongoDB connection pool and serves only
structurally clean candidates. Those candidates still need medical review.
Search matches literal text, and timed exams sample questions from this subset.
The frontend never connects to Atlas directly.

To return to the local SQLite backup, set `QUESTION_STORE=sqlite` and restart.
Atlas errors are reported rather than silently switching stores. SQLite and
MongoDB are not automatically synchronized; the migration script is explicit.

`npm run preview` also supports the endpoint. A static deployment of `dist/`
alone does not include a backend; a production deployment needs a server runtime.
