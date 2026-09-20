import unittest
from extract_questions import block, parse_questions, docx_blocks
import io
import zipfile


class ExtractionTests(unittest.TestCase):
    def parse(self, text):
        return parse_questions([block(line, f'line:{i}') for i, line in enumerate(text.splitlines(), 1)])

    def test_numbered_questions_do_not_absorb_answers_or_next_question(self):
        qs = self.parse('1. Which test should be performed first?\nA. Alpha\nB. Beta\nC. Gamma\nD. Delta\nAnswer: B\nExplanation: supporting discussion\n2. Which treatment should be offered next?\nA. One\nB. Two\nC. Three\nD. Four')
        self.assertEqual(len(qs), 2)
        self.assertEqual(qs[0]['options'][-1]['text'], 'Delta')
        self.assertNotIn('supporting', qs[1]['stem'])

    def test_multiline_option_and_source_reference(self):
        qs = self.parse('4. Which choice is the most appropriate?\nA. Long choice\ncontinued on another line\nB. Second\nC. Third\nD. Fourth')
        self.assertEqual(qs[0]['options'][0]['text'], 'Long choice\ncontinued on another line')
        self.assertEqual(qs[0]['start'], 'line:1')

    def test_visual_and_incomplete_options_are_flagged(self):
        q = self.parse('1. What does the following image demonstrate?\nA. Alpha\nB. Beta')[0]
        self.assertIn('visual_dependency', q['flags'])
        self.assertIn('unusual_option_count', q['flags'])

    def test_prose_and_answer_keys_are_not_questions(self):
        self.assertEqual(self.parse('1. A\n2. B\n3. C\nThis is a lecture without options.'), [])

    def test_nested_word_list_stays_in_stem(self):
        bs = [block('Which combination of factors is correct?', 'p1', numbering=dict(format='decimal', value=47, list_id='exam'))]
        for i, text in enumerate(['First factor', 'Second factor'], 1):
            bs.append(block(text, f'p{i+1}', numbering=dict(format='decimal', value=i, list_id='factors')))
        for label in 'ABCD':
            bs.append(block(f'{label}. Choice {label}', 'options'))
        q = parse_questions(bs)[0]
        self.assertEqual(q['number'], '47')
        self.assertIn('1. First factor', q['stem'])
        self.assertIn('2. Second factor', q['stem'])

    def test_word_list_numbering(self):
        w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
        parts = []
        for nid, text in [('1', 'Which investigation should be performed next?'), ('2', 'Alpha'), ('2', 'Beta'), ('2', 'Gamma'), ('2', 'Delta')]:
            parts.append(f'<w:p><w:pPr><w:numPr><w:numId w:val="{nid}"/></w:numPr></w:pPr><w:r><w:t>{text}</w:t></w:r></w:p>')
        numbering = f'<w:numbering xmlns:w="{w}">'
        for nid, fmt in [('1', 'decimal'), ('2', 'lowerLetter')]:
            numbering += f'<w:abstractNum w:abstractNumId="{nid}"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="{fmt}"/></w:lvl></w:abstractNum><w:num w:numId="{nid}"><w:abstractNumId w:val="{nid}"/></w:num>'
        out = io.BytesIO()
        with zipfile.ZipFile(out, 'w') as z:
            z.writestr('word/document.xml', f'<w:document xmlns:w="{w}"><w:body>{"".join(parts)}</w:body></w:document>')
            z.writestr('word/numbering.xml', numbering + '</w:numbering>')
        qs = parse_questions(docx_blocks(out.getvalue())[0])
        self.assertEqual(len(qs), 1)
        self.assertEqual([o['label'] for o in qs[0]['options']], list('ABCD'))
        self.assertEqual(qs[0]['number'], '1')


if __name__ == '__main__':
    unittest.main()
