"""Compare the running app's API with the SQLite migration source."""
import json
from pathlib import Path
import sqlite3
from urllib.parse import urlencode
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def request(**params):
    with urlopen('http://127.0.0.1:5173/api/questions?' + urlencode(params), timeout=30) as response:
        return json.load(response)


with sqlite3.connect((ROOT / 'data/extraction/questions.sqlite').as_uri() + '?mode=ro', uri=True) as db:
    db.row_factory = sqlite3.Row
    expected_total = db.execute("SELECT count(*) FROM questions WHERE structural_status='structurally_clean'").fetchone()[0]
    for offset in [0, 100, expected_total - 1]:
        result = request(offset=offset)
        assert result['total'] == expected_total
        expected = db.execute("SELECT id,stem FROM questions WHERE structural_status='structurally_clean' ORDER BY id LIMIT 1 OFFSET ?", (offset,)).fetchone()
        actual = result['questions'][0]
        assert (actual['id'], actual['stem']) == (expected['id'], expected['stem'])
        assert actual['options'] == [dict(r) for r in db.execute('SELECT label,text FROM options WHERE question_id=? ORDER BY label', (expected['id'],))]
    for term in ['kidney', '(a)', 'zzzz_no_question_match']:
        result = request(search=term, limit=3)
        expected = db.execute("SELECT count(*) FROM questions WHERE structural_status='structurally_clean' AND instr(lower(stem), lower(?)) > 0", (term,)).fetchone()[0]
        assert result['total'] == expected, term
    sample = request(random='true', limit=10)['questions']
    assert len(sample) == len({q['id'] for q in sample}) == 10
    for q in sample:
        assert db.execute("SELECT structural_status FROM questions WHERE id=?", (q['id'],)).fetchone()[0] == 'structurally_clean'
print('API verified against SQLite: counts, pagination, options, literal search, and random sampling.')
