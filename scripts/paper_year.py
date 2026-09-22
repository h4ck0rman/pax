"""Derive the year of the paper a question came from, using its source path.

Nothing in the extracted records carries an exam year: the only signal is the
folder and file naming of the source documents, which label papers by year
("2019 Alfred Paper Clinical Applications.docx", "AMP2006b.pdf",
"Collated Past Papers/Concord/2021/...").

The derivation is deliberately conservative. It reads the deepest path segment
that names a year, because the segment closest to the file is the one that
describes the file rather than the collection it was filed under. Segments that
name the download archive itself ("Concord Study Group 2023 2") are skipped, so
the year of the collection is never mistaken for the year of a paper. A path
that names no year yields None, which is a real answer and not a default.
"""
import re

# A four digit year, not part of a longer run of digits. Bounded so that page
# counts, dosages and identifiers do not read as years.
YEAR = re.compile(r'(?<!\d)(19[89]\d|20[0-4]\d)(?!\d)')

# The name of the download the documents arrived in. Every path starts with one,
# and it stamps its own year onto unrelated material underneath it.
COLLECTION = re.compile(r'^concord study group\s*\d{4}(\s*\d+)?$', re.IGNORECASE)

# A span such as "1999-2011 RACP Past Papers" names a range of papers, not one
# paper, so the numbers in it say nothing about the file underneath.
SPAN = re.compile(r'(?<!\d)(?:19|20)\d\d\s*(?:-|–|—|to)\s*(?:19|20)\d\d(?!\d)')


def paper_year(source):
    """Return the year of the paper at `source`, or None when it names none."""
    if not source:
        return None
    # Archive members are written as "<archive>.zip!/<member>"; the separator is
    # still a path separator for this purpose.
    segments = [segment for segment in re.split(r'[/\\]', str(source)) if segment]
    for segment in reversed(segments):
        name = segment.removesuffix('!')
        if COLLECTION.match(name.removesuffix('.zip')):
            continue
        if SPAN.search(name):
            continue
        found = YEAR.findall(name)
        if found:
            # A single segment naming several years ("2023_2024-TRIAL-...") is
            # naming the sitting the paper was written for, which is the later.
            return int(max(found))
    return None


def paper_years(sources):
    """The most recent year among several sources, or None when none name one."""
    years = [year for year in (paper_year(source) for source in sources) if year]
    return max(years) if years else None
