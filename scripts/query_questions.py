"""Read-only JSON query for Pax's local web application."""
from collections import defaultdict
import json
from pathlib import Path
import sqlite3
import sys

sys.stdout.reconfigure(encoding='utf-8')
params = json.loads(sys.argv[1])
path = Path(__file__).resolve().parents[1] / 'data/extraction/questions.sqlite'
db = sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)
db.row_factory = sqlite3.Row
search = str(params.get('search', ''))[:200]
limit = max(1, min(100, int(params.get('limit', 1))))
offset = max(0, int(params.get('offset', 0)))
min_year = params.get('minYear')
where = "structural_status = 'structurally_clean'"
args = []
if search:
    where += ' AND instr(lower(stem), lower(?)) > 0'
    args.append(search)
if min_year:
    # A question whose source names no year is excluded rather than assumed to
    # be recent: the year is unknown, not zero.
    where += ' AND paper_year IS NOT NULL AND paper_year >= ?'
    args.append(max(1980, min(2049, int(min_year))))
total = db.execute(f'SELECT count(*) FROM questions WHERE {where}', args).fetchone()[0]
order = 'random()' if params.get('random') else 'id'
rows = db.execute(f'SELECT id, stem, paper_year FROM questions WHERE {where} ORDER BY {order} LIMIT ? OFFSET ?', [*args, limit, offset]).fetchall()

# One query per collection rather than one per drawn question: the per-row form
# scanned the whole occurrences table for every question in a draw.
ids = [row['id'] for row in rows]
placeholders = ','.join('?' * len(ids))
options = defaultdict(list)
sources = {}
if ids:
    for record in db.execute(f'SELECT question_id, label, text FROM options WHERE question_id IN ({placeholders}) ORDER BY question_id, label', ids):
        options[record['question_id']].append(dict(label=record['label'], text=record['text']))
    for record in db.execute(f'SELECT question_id, source, original_number, start FROM occurrences WHERE question_id IN ({placeholders}) ORDER BY question_id, rowid', ids):
        sources.setdefault(record['question_id'], dict(source=record['source'], original_number=record['original_number'], start=record['start']))

questions = []
for row in rows:
    item = dict(row)
    item['options'] = options[row['id']]
    item['source'] = sources.get(row['id'])
    questions.append(item)
print(json.dumps({'total': total, 'questions': questions}, ensure_ascii=False))
db.close()
