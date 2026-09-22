"""Tests for the paper year derivation.

Run through unittest discover, as with the extraction tests, because the module
is imported by bare name:

    python -m unittest discover -s scripts -p test_paper_year.py
"""
import unittest

from paper_year import paper_year, paper_years


class PaperYearTests(unittest.TestCase):
    def test_reads_a_year_from_the_file_name(self):
        self.assertEqual(paper_year('2019 Alfred Paper Clinical Applications.docx'), 2019)
        self.assertEqual(paper_year('AMP2006b.pdf'), 2006)

    def test_reads_the_deepest_segment_that_names_a_year(self):
        # The folder says 2021 and the file says nothing, so the folder answers.
        self.assertEqual(paper_year('Collated Past Papers/Concord/2021/Paper A.pdf'), 2021)
        # The file says 2018 while the folder says 2021, and the file wins
        # because it describes itself rather than where it was filed.
        self.assertEqual(paper_year('Collated Past Papers/2021/2018 Written Paper.pdf'), 2018)

    def test_accepts_windows_separators(self):
        self.assertEqual(paper_year('resources\\Papers\\2017\\Paper 1.pdf'), 2017)

    def test_treats_archive_members_as_paths(self):
        self.assertEqual(
            paper_year('Concord Study Group 2023 2.zip!/2015/Basic Sciences.pdf'),
            2015,
        )

    def test_skips_the_archive_that_stamps_its_own_year(self):
        # Without the skip this answers 2023, the year of the download, for a
        # document that names no year of its own.
        self.assertIsNone(paper_year('Concord Study Group 2023 2.zip!/Notes/Cardiology.pdf'))
        self.assertIsNone(paper_year('Concord Study Group 2023.zip!/Textbook.pdf'))

    def test_skips_a_span_of_years(self):
        # A range names a collection of papers, not one paper.
        self.assertIsNone(paper_year('1999-2011 RACP Past Papers/Untitled.pdf'))
        self.assertEqual(paper_year('1999-2011 RACP Past Papers/2004 Paper 2.pdf'), 2004)
        for dash in ('-', chr(0x2013), chr(0x2014), ' to '):
            with self.subTest(dash=dash):
                self.assertIsNone(paper_year('2001%s2009 Collection/Notes.pdf' % dash))

    def test_takes_the_later_year_of_a_sitting(self):
        self.assertEqual(paper_year('2023_2024-TRIAL-Paper-1.pdf'), 2024)

    def test_ignores_numbers_that_are_not_years(self):
        # Part of a longer run of digits, out of range, or simply not a year.
        self.assertIsNone(paper_year('Paper 12019 notes.pdf'))
        self.assertIsNone(paper_year('Question 1899 set.pdf'))
        self.assertIsNone(paper_year('Dose 2500 mg.pdf'))
        self.assertIsNone(paper_year('Paper 1 Questions.pdf'))

    def test_a_missing_source_is_not_an_error(self):
        self.assertIsNone(paper_year(None))
        self.assertIsNone(paper_year(''))

    def test_several_sources_answer_with_the_most_recent(self):
        self.assertEqual(paper_years(['2012 Paper.pdf', '2019 Paper.pdf']), 2019)
        self.assertEqual(paper_years(['Notes.pdf', '2019 Paper.pdf']), 2019)
        self.assertIsNone(paper_years(['Notes.pdf', 'Textbook.pdf']))
        self.assertIsNone(paper_years([]))


if __name__ == '__main__':
    unittest.main()
