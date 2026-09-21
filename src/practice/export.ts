import { toParagraphs, toSingleLine } from '../questions/text';
import type { CompletedTest } from './types';

/** Seconds as m:ss, for durations under an hour. */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/** Seconds as a phrase, for prose and exported documents. */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  if (!minutes) return `${rest}s`;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function sourceLine(test: CompletedTest['answers'][number]): string {
  const { source } = test.question;
  if (!source) return 'Source: not recorded';
  const file = source.source.split(/[\\/]/).pop() ?? source.source;
  const original = source.original_number ? `original question ${source.original_number}, ` : '';
  return `Source: ${file} (${original}${source.start})`;
}

/** A Markdown document holding every question, its options, and what the
 *  candidate selected, with instructions for a language model to grade it.
 *  Pax has no verified answer keys, so grading happens outside the app. */
export function buildGradingDocument(test: CompletedTest): string {
  const used = test.usedSeconds;
  const answered = test.answers.filter(answer => answer.selected).length;

  const lines: string[] = [
    '# Pax practice test',
    '',
    `- Completed: ${new Date(test.finishedAt).toISOString()}`,
    `- Questions: ${test.answers.length}`,
    `- Time limit: ${test.config.minutes} minutes`,
    `- Time taken: ${formatDuration(used)}${test.expired ? ' (time ran out)' : ''}`,
    `- Answered: ${answered} of ${test.answers.length}`,
    '',
    '## Grading request',
    '',
    'These are multiple-choice questions extracted from past exam papers for Basic',
    'Physician Training. The question bank has no verified answer key, so the answers',
    'recorded below are only what the candidate selected, and nothing here states or',
    'implies a correct option.',
    '',
    'For each question, please give the correct option with a short explanation, say',
    'whether the candidate selected it, and flag any question that looks misextracted',
    `or unanswerable as written. Finish with a total out of ${test.answers.length} and a note on`,
    'the themes the candidate should revise.',
    '',
    '---',
  ];

  test.answers.forEach((answer, position) => {
    lines.push(
      '',
      `### Question ${position + 1}`,
      '',
      sourceLine(answer),
      '',
      ...toParagraphs(answer.question.stem).flatMap(paragraph => [paragraph, '']),
    );
    answer.question.options.forEach(option => {
      lines.push(`- ${option.label}. ${toSingleLine(option.text)}`);
    });
    lines.push('', `Candidate answer: ${answer.selected ?? 'not answered'}`);
  });

  lines.push('');
  return lines.join('\n');
}

/** A filename that sorts by when the test was taken. */
export function buildFileName(test: CompletedTest): string {
  const stamp = new Date(test.finishedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `pax-practice-test-${stamp}.md`;
}
