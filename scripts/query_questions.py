"""Read-only JSON query for Pax's local web application."""
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
where = "structural_status = 'structurally_clean'"
args = []
if search:
    where += ' AND instr(lower(stem), lower(?)) > 0'
    args.append(search)
total = db.execute(f'SELECT count(*) FROM questions WHERE {where}', args).fetchone()[0]
order = 'random()' if params.get('random') else 'id'
rows = db.execute(f'SELECT id, stem FROM questions WHERE {where} ORDER BY {order} LIMIT ? OFFSET ?', [*args, limit, offset]).fetchall()
questions = []
for row in rows:
    item = dict(row)
    item['options'] = [dict(r) for r in db.execute('SELECT label,text FROM options WHERE question_id=? ORDER BY label', (row['id'],))]
    source = db.execute('SELECT source,original_number,start FROM occurrences WHERE question_id=? LIMIT 1', (row['id'],)).fetchone()
    item['source'] = dict(source) if source else None
    questions.append(item)
print(json.dumps({'total': total, 'questions': questions}, ensure_ascii=False))
db.close()
