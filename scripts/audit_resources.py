"""Inventory the export and extract DOCX text / sampled PDF pages for inspection.

This deliberately does not claim to produce validated questions or answer keys.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import logging
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools' / 'python'))
from pypdf import PdfReader
logging.getLogger('pypdf').setLevel(logging.ERROR)

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def docx_text(path):
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read('word/document.xml'))
        paragraphs = []
        auto_numbered = images = highlighted = 0
        for p in root.iter(W + 'p'):
            fragments = []
            for node in p.iter():
                if node.tag == W + 't':
                    fragments.append(node.text or '')
                elif node.tag == W + 'tab':
                    fragments.append('\t')
                elif node.tag in (W + 'br', W + 'cr'):
                    fragments.append('\n')
            paragraphs.append(''.join(fragments))
            auto_numbered += int(p.find('.//' + W + 'numPr') is not None)
            images += len(list(p.iter(W + 'drawing')))
            highlighted += len(list(p.iter(W + 'highlight')))
        return '\n'.join(paragraphs), {
            'paragraphs': len(paragraphs), 'auto_numbered_paragraphs': auto_numbered,
            'drawing_count': images, 'highlight_count': highlighted,
            'table_count': len(list(root.iter(W + 'tbl'))),
            'embedded_media_count': sum(n.startswith('word/media/') for n in archive.namelist()),
        }


def category(path):
    parts = path.parts
    if 'Concord Study Group 2023' in parts:
        i = parts.index('Concord Study Group 2023')
        return parts[i + 1] if len(parts) > i + 2 else '(loose files)'
    return '(export root)'


def run(resources, output, full_pdf, resume=False):
    output.mkdir(parents=True, exist_ok=True)
    text_dir = output / 'text'
    text_dir.mkdir(exist_ok=True)
    records, archives = [], []
    previous = {}
    if resume and (output / 'inventory.json').exists():
        previous = {r['path']: r for r in json.loads((output / 'inventory.json').read_text(encoding='utf-8'))}
    paths = sorted(p for p in resources.rglob('*') if p.is_file())
    for index, path in enumerate(paths, 1):
        relative = path.relative_to(resources).as_posix()
        ext = path.suffix.lower()
        row = {'path': relative, 'extension': ext, 'bytes': path.stat().st_size,
               'category': category(path.relative_to(resources))}
        if ext == '.zip':
            try:
                with zipfile.ZipFile(path) as archive:
                    members = [{'name': i.filename, 'bytes': i.file_size, 'crc32': i.CRC}
                               for i in archive.infolist() if not i.is_dir()]
                archives.append({'path': relative, 'members': members})
                row.update(status='archive_indexed', members=len(members))
            except Exception as exc:
                row.update(status='error', error=str(exc))
        else:
            try:
                with path.open('rb') as stream:
                    digest = hashlib.file_digest(stream, 'sha256').hexdigest()
                row['sha256'] = digest
                old = previous.get(relative, {})
                if (old.get('sha256') == digest and old.get('status', '').startswith(('extracted_', 'sampled_'))
                        and not (full_pdf and old.get('status') == 'sampled_pdf')
                        and (output / old.get('text_file', 'missing')).is_file()):
                    records.append(old)
                    continue
                text = None
                if ext == '.docx':
                    text, info = docx_text(path)
                    row.update(info, status='extracted_docx')
                elif ext == '.pdf':
                    reader = PdfReader(path)
                    count = len(reader.pages)
                    # Include front matter, early questions, midpoint and final answer pages.
                    selected = list(range(count)) if full_pdf else sorted(
                        {i for i in (0, 1, 2, 3, 4, count // 2, count - 1) if 0 <= i < count})
                    pages = []
                    for i in selected:
                        value = reader.pages[i].extract_text() or ''
                        pages.append({'page': i + 1, 'characters': len(value.strip())})
                        if value.strip():
                            pages[-1]['preview'] = value[:180]
                        pages[-1]['low_text'] = len(value.strip()) < 80
                        if text is None:
                            text = ''
                        text += f'\n\n--- PAGE {i + 1} ---\n{value}'
                    row.update(status='extracted_pdf' if full_pdf else 'sampled_pdf',
                               page_count=count, sampled_pages=pages,
                               low_text_pages=sum(p['low_text'] for p in pages))
                elif ext == '.pptx':
                    with zipfile.ZipFile(path) as archive:
                        slides = sorted((n for n in archive.namelist()
                                         if re.fullmatch(r'ppt/slides/slide\d+\.xml', n)),
                                        key=lambda n: int(re.search(r'(\d+)\.xml', n)[1]))
                        chunks = []
                        for n in slides:
                            root = ET.fromstring(archive.read(n))
                            paragraphs = [''.join(t.text or '' for t in p.iter(
                                '{http://schemas.openxmlformats.org/drawingml/2006/main}t'))
                                for p in root.iter('{http://schemas.openxmlformats.org/drawingml/2006/main}p')]
                            chunks.append(f'--- SLIDE {len(chunks) + 1} ---\n' + '\n'.join(paragraphs))
                        text = '\n\n'.join(chunks)
                        row.update(status='extracted_pptx', slide_count=len(slides))
                elif ext in ('.txt', '.json'):
                    text = path.read_text(encoding='utf-8-sig')
                    if ext == '.json':
                        json.loads(text)
                    row.update(status='extracted_text')
                else:
                    row['status'] = 'needs_format_handler'
                if text is not None:
                    target = text_dir / f'{digest}.txt'
                    target.write_text(text, encoding='utf-8')
                    row.update(text_file=target.relative_to(output).as_posix(), characters=len(text),
                               question_markers=len(re.findall(r'^\s*(?:Question\s+)?\d{1,3}[.)]\s+', text, re.M | re.I)),
                               option_markers=len(re.findall(r'^\s*[A-Ea-e][.)]\s+', text, re.M)))
            except Exception as exc:
                row.update(status='error', error=f'{type(exc).__name__}: {exc}')
        records.append(row)
        if index % 50 == 0:
            print(f'Inspected {index}/{len(paths)} files', flush=True)
    hashes = defaultdict(list)
    for row in records:
        if 'sha256' in row:
            hashes[row['sha256']].append(row['path'])
    summary = {
        'files': len(records), 'extensions': dict(Counter(r['extension'] for r in records)),
        'categories': dict(Counter(r['category'] for r in records)),
        'statuses': dict(Counter(r['status'] for r in records)),
        'exact_duplicate_groups': [v for v in hashes.values() if len(v) > 1],
        'pdf_pages': sum(r.get('page_count', 0) for r in records),
        'pdfs_with_low_text_sample': sum(r.get('low_text_pages', 0) > 0 for r in records),
        'docx_with_auto_numbering': sum(r.get('auto_numbered_paragraphs', 0) > 0 for r in records),
        'docx_with_media': sum(r.get('embedded_media_count', 0) > 0 for r in records),
        'errors': [r for r in records if r['status'] == 'error'],
    }
    for name, data in [('inventory', records), ('archives', archives), ('summary', summary)]:
        (output / f'{name}.json').write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
    print(json.dumps({k: v for k, v in summary.items() if k not in ('exact_duplicate_groups', 'errors')}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--resources', type=Path, default=ROOT / 'resources')
    parser.add_argument('--output', type=Path, default=ROOT / 'data' / 'audit')
    parser.add_argument('--full-pdf', action='store_true', help='Extract all PDF pages instead of a sample')
    parser.add_argument('--resume', action='store_true', help='Reuse extracted text when the source hash matches')
    args = parser.parse_args()
    if not args.resources.is_dir():
        parser.error('Resources directory does not exist')
    if args.output.resolve().is_relative_to(args.resources.resolve()):
        parser.error('Output must be outside resources')
    run(args.resources, args.output, args.full_pdf, args.resume)
