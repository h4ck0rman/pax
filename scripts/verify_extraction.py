"""Verify generated database, report counts, and source relationships."""
import json
from pathlib import Path
import sqlite3
from collections import Counter

root = Path(__file__).resolve().parents[1] / 'data' / 'extraction'
summary = json.loads((root / 'summary.json').read_text(encoding='utf-8'))
files = json.loads((root / 'files.json').read_text(encoding='utf-8'))
db = sqlite3.connect(root / 'questions.sqlite')
assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
assert db.execute('PRAGMA foreign_key_check').fetchall() == []
assert db.execute('SELECT COUNT(*) FROM documents').fetchone()[0] == len(files)
assert db.execute('SELECT COUNT(*) FROM questions').fetchone()[0] == summary['unique_question_candidates']
assert db.execute('SELECT COUNT(*) FROM occurrences').fetchone()[0] == summary['question_occurrences'] == sum(f['candidates'] for f in files)
assert dict(db.execute('SELECT structural_status, COUNT(*) FROM questions GROUP BY structural_status')) == summary['unique_structural_statuses']
assert db.execute("SELECT COUNT(*) FROM options o JOIN questions q ON q.id=o.question_id WHERE q.structural_status='structurally_clean' AND TRIM(o.text)=''").fetchone()[0] == 0
for qid, status, count in db.execute('SELECT q.id, q.structural_status, COUNT(o.label) FROM questions q LEFT JOIN options o ON o.question_id=q.id GROUP BY q.id'):
    assert 2 <= count <= 5
    if status == 'structurally_clean':
        assert count in (4, 5)
for name, expected in [('questions', summary['unique_question_candidates']), ('occurrences', summary['question_occurrences'])]:
    with (root / f'{name}.jsonl').open(encoding='utf-8') as f:
        assert sum(1 for line in f if json.loads(line)) == expected
print('Database integrity, source links, report/export counts, and structural invariants passed.')
print('Deferred formats:', dict(Counter(f['extension'] for f in files if f['status'] == 'deferred')))
print('Failures:', [(f['path'], f['reason']) for f in files if f['status'] == 'failed'])
db.close()
