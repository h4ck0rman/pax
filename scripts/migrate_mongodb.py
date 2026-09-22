"""Migrate SQLite to Atlas. Defaults to dry-run; --apply inserts missing records.

Existing MongoDB documents are never overwritten or deleted. Stable IDs make
reruns resumable. Verification checks every imported ID and content fingerprint.
"""
import argparse
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import sys

from mongo_config import ROOT, connect
from paper_year import paper_year, paper_years
from bson import BSON
from pymongo import UpdateOne


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def read_sqlite(path):
    db = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok' or db.execute('PRAGMA foreign_key_check').fetchall():
        raise ValueError('SQLite integrity check failed')
    options, sources = defaultdict(list), defaultdict(list)
    for r in db.execute('SELECT * FROM options ORDER BY question_id,label'):
        options[r['question_id']].append(dict(label=r['label'], text=r['text']))
    documents = []
    for r in db.execute('SELECT * FROM documents ORDER BY path'):
        documents.append(dict(_id=fingerprint(r['path']), path=r['path'], status=r['status'], metadata=json.loads(r['metadata_json'])))
    occurrences, repeats = [], defaultdict(int)
    for r in db.execute('SELECT * FROM occurrences ORDER BY rowid'):
        record = dict(question_id=r['question_id'], document_id=fingerprint(r['source']), source=r['source'],
                      original_number=r['original_number'], start=r['start'], end=r['end'],
                      flags=json.loads(r['flags_json']), structural_status=r['structural_status'])
        key = fingerprint(record)
        repeats[key] += 1
        record['_id'] = fingerprint([key, repeats[key]])
        record['paper_year'] = paper_year(r['source'])
        occurrences.append(record)
        sources[r['question_id']].append(dict(source=r['source'], original_number=r['original_number'], start=r['start']))
    questions = []
    for r in db.execute('SELECT * FROM questions ORDER BY id'):
        questions.append(dict(_id=r['id'], stem=r['stem'], options=options[r['id']],
                              structural_status=r['structural_status'], flags=json.loads(r['flags_json']),
                              raw_text=r['raw_text'], review_status=r['review_status'],
                              source=sources[r['id']][0] if sources[r['id']] else None,
                              paper_year=paper_years(s['source'] for s in sources[r['id']])))
    db.close()
    collections = dict(documents=documents, questions=questions, occurrences=occurrences)
    for records in collections.values():
        for record in records:
            record['import_fingerprint'] = fingerprint({k: v for k, v in record.items() if k not in NOT_FINGERPRINTED})
            if len(BSON.encode(record)) >= 16 * 1024 * 1024:
                raise ValueError('Document exceeds MongoDB size limit')
    return collections


# The paper year is derived from the source path rather than extracted, so it can
# be refreshed in place without that counting as an overwrite. It is kept out of
# the fingerprint so that refreshing it does not invalidate records imported
# before it existed; every other field still has to match byte for byte.
NOT_FINGERPRINTED = ('paper_year',)

# Fields allowed to differ from the snapshot: the fingerprint is checked on its
# own, review status is set by a reviewer after import, and the paper year is
# derived.
NOT_COMPARED = ('import_fingerprint', 'review_status', 'paper_year')


def verify(database, collections):
    result = {}
    for name, records in collections.items():
        expected = {r['_id']: r for r in records}
        matched = 0
        for start in range(0, len(records), 500):
            ids = [r['_id'] for r in records[start:start + 500]]
            for actual in database[name].find({'_id': {'$in': ids}}):
                original = expected[actual['_id']]
                # Review status can be legitimately updated after import.
                content = {k: actual.get(k) for k in original if k not in NOT_COMPARED}
                wanted = {k: v for k, v in original.items() if k not in NOT_COMPARED}
                if actual.get('import_fingerprint') != original['import_fingerprint'] or content != wanted:
                    raise ValueError(f'Existing {name} content differs from the SQLite snapshot; no data was overwritten')
                matched += 1
        if matched != len(records):
            raise ValueError(f'{name}: expected {len(records)}, verified {matched}')
        result[name] = {'expected': len(records), 'verified': matched, 'collection_total': database[name].count_documents({})}
        print(f'Verified {name}: {matched}', flush=True)
    return result


def refresh_derived(database, collections):
    """Fill in derived fields and the read indexes on records already imported.

    Records are inserted with $setOnInsert, so anything imported before
    paper_year existed still carries none. The year is derived from the source
    path rather than extracted, so writing it is not an overwrite of content.
    """
    refreshed = 0
    for name in ('questions', 'occurrences'):
        records = collections[name]
        for start in range(0, len(records), 500):
            ops = [UpdateOne({'_id': r['_id'], 'paper_year': {'$ne': r['paper_year']}},
                             {'$set': {'paper_year': r['paper_year']}})
                   for r in records[start:start + 500]]
            refreshed += database[name].bulk_write(ops, ordered=False).modified_count
        print(f'Refreshed paper_year on {name}: {refreshed} so far', flush=True)
    # The reader filters on structural_status and paper_year, then sorts by _id.
    database.questions.create_index([('structural_status', 1), ('paper_year', 1), ('_id', 1)],
                                    name='structural_status_paper_year_id')
    database.occurrences.create_index('question_id')
    database.occurrences.create_index('document_id')
    dated = database.questions.count_documents(
        {'structural_status': 'structurally_clean', 'paper_year': {'$ne': None}})
    served = database.questions.count_documents({'structural_status': 'structurally_clean'})
    print(f'Served questions: {served}; with a paper year: {dated}; without: {served - dated}', flush=True)
    return refreshed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sqlite', type=Path, default=ROOT / 'data/extraction/questions.sqlite')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--refresh-derived', action='store_true',
                        help='Only refresh derived fields and indexes. No question content is inserted or changed.')
    args = parser.parse_args()
    collections = read_sqlite(args.sqlite)
    counts = {name: len(records) for name, records in collections.items()}
    print('SQLite migration plan:', json.dumps(counts), flush=True)
    if not args.apply and not args.verify and not args.refresh_derived:
        print('Dry-run only. Use --apply to insert missing records into Atlas.')
        return
    client, database = connect()
    try:
        inserted = {}
        if args.apply:
            for name, records in collections.items():
                inserted[name] = 0
                for start in range(0, len(records), 500):
                    ops = [UpdateOne({'_id': r['_id']}, {'$setOnInsert': r}, upsert=True) for r in records[start:start + 500]]
                    result = database[name].bulk_write(ops, ordered=False)
                    inserted[name] += result.upserted_count
                    if start % 5000 == 0:
                        print(f'Imported {name}: {min(start + 500, len(records))}/{len(records)}', flush=True)
        if args.apply or args.refresh_derived:
            inserted['paper_year_refreshed'] = refresh_derived(database, collections)
        if args.refresh_derived and not args.apply:
            print('Derived fields and indexes refreshed. No question content was inserted or changed.')
            return
        verified = verify(database, collections)
        report = dict(database=database.name, completed_at=datetime.now(timezone.utc).isoformat(),
                      inserted=inserted, collections=verified,
                      options=sum(len(q['options']) for q in collections['questions']),
                      structurally_clean=database.questions.count_documents({'structural_status': 'structurally_clean'}),
                      source='data/extraction/questions.sqlite', verified=True)
        out = ROOT / 'data/mongodb'
        out.mkdir(exist_ok=True)
        (out / 'migration-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, indent=2))
    finally:
        client.close()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # Driver errors may include connection strings. Do not print them.
        print(f'Migration stopped ({type(exc).__name__}). Check Atlas access, permissions, or snapshot consistency. Credentials were not logged.', file=sys.stderr)
        sys.exit(1)
