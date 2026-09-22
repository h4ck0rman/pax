"""Add the derived paper year and the read indexes to an existing extraction.

A full rerun of `extract_questions.py` would rebuild `data/extraction/` from
scratch, which means rereading tens of thousands of PDF pages. The paper year is
derived from source paths that are already stored, so it can be filled in place
instead. The indexes are the ones the reader needs; the extraction used to ship
without them, which made every drawn question scan the whole occurrences table.

Idempotent: rerunning it recomputes the same values and leaves the schema alone.
Nothing under `resources/` is touched and no question text is altered.
"""
import argparse
from collections import defaultdict
from pathlib import Path
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paper_year import paper_year, paper_years

ROOT = Path(__file__).resolve().parent.parent


def add_column(db, table, column, declaration):
    """Add a column unless the table already has it."""
    existing = {row[1] for row in db.execute(f'PRAGMA table_info({table})')}
    if column in existing:
        return False
    db.execute(f'ALTER TABLE {table} ADD COLUMN {column} {declaration}')
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sqlite', type=Path, default=ROOT / 'data/extraction/questions.sqlite')
    args = parser.parse_args()
    if not args.sqlite.exists():
        raise SystemExit(f'No extraction database at {args.sqlite}. Run scripts/extract_questions.py first.')

    db = sqlite3.connect(args.sqlite)
    try:
        with db:
            for table in ('questions', 'occurrences'):
                added = add_column(db, table, 'paper_year', 'INTEGER')
                print(f'{table}.paper_year: {"added" if added else "already present"}')

            sources = defaultdict(list)
            occurrence_years = []
            for rowid, question_id, source in db.execute('SELECT rowid, question_id, source FROM occurrences'):
                sources[question_id].append(source)
                occurrence_years.append((paper_year(source), rowid))
            db.executemany('UPDATE occurrences SET paper_year = ? WHERE rowid = ?', occurrence_years)

            # A question found in several papers carries the most recent of them.
            question_years = [(paper_years(paths), question_id) for question_id, paths in sources.items()]
            db.executemany('UPDATE questions SET paper_year = ? WHERE id = ?', question_years)

            db.execute('CREATE INDEX IF NOT EXISTS questions_served ON questions(structural_status, paper_year)')
            db.execute('CREATE INDEX IF NOT EXISTS occurrences_question ON occurrences(question_id)')
        db.execute('ANALYZE')

        clean = "structural_status = 'structurally_clean'"
        served = db.execute(f'SELECT count(*) FROM questions WHERE {clean}').fetchone()[0]
        dated = db.execute(f'SELECT count(*) FROM questions WHERE {clean} AND paper_year IS NOT NULL').fetchone()[0]
        print(f'\nServed questions: {served}; with a paper year: {dated}; without: {served - dated}')
        print('Served questions by year, most recent first:')
        for year, count in db.execute(
            f'SELECT paper_year, count(*) FROM questions WHERE {clean} AND paper_year IS NOT NULL'
            ' GROUP BY paper_year ORDER BY paper_year DESC'
        ):
            print(f'  {year}  {count}')
    finally:
        db.close()


if __name__ == '__main__':
    main()
