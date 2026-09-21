import { useCallback, useRef, useState } from 'react';
import { Check, ClipboardCopy, Download, RotateCcw } from 'lucide-react';
import { toSingleLine } from '../questions/text';
import { buildFileName, buildGradingDocument, formatDuration } from './export';
import type { CompletedTest } from './types';

type Props = { test: CompletedTest; onRestart: () => void };

type CopyState = 'idle' | 'copied' | 'manual';

/** What happened, and how to get the paper out for grading elsewhere. */
export default function TestReview({ test, onRestart }: Props) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const manualRef = useRef<HTMLTextAreaElement>(null);

  const answered = test.answers.filter(answer => answer.selected).length;
  const used = test.usedSeconds;
  const document_ = buildGradingDocument(test);

  const copyForLlm = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(document_);
      setCopyState('copied');
    } catch {
      // Clipboard access can be refused or unavailable, so fall back to showing
      // the text for the reader to copy by hand.
      setCopyState('manual');
      requestAnimationFrame(() => manualRef.current?.select());
    }
  }, [document_]);

  const exportTest = useCallback(() => {
    const blob = new Blob([document_], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = buildFileName(test);
    window.document.body.append(link);
    link.click();
    link.remove();
    // Revoking in the same tick can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [document_, test]);

  return (
    <section className="question-box">
      <header className="question-meta">
        <span className="eyebrow">Practice test</span>
        <span className="question-count">
          {test.expired ? 'Time ran out' : 'Finished'} · {formatDuration(used)}
        </span>
      </header>

      <h2 className="setup-title">
        {test.expired ? 'Time is up.' : 'Test complete.'}
      </h2>
      <p className="setup-lead">
        You answered {answered} of {test.answers.length} questions in {formatDuration(used)}, against
        a {test.config.minutes} minute limit. Pax does not mark the paper, because the bank has no
        verified answer keys.
      </p>

      <div className="review-actions">
        <button type="button" className="button" onClick={copyForLlm}>
          {copyState === 'copied' ? (
            <>
              <Check size={16} aria-hidden="true" /> Copied
            </>
          ) : (
            <>
              <ClipboardCopy size={16} aria-hidden="true" /> Copy for LLM
            </>
          )}
        </button>

        <button type="button" className="button button-outline" onClick={exportTest}>
          <Download size={16} aria-hidden="true" /> Export test
        </button>

        <button type="button" className="link" onClick={onRestart}>
          <RotateCcw size={15} aria-hidden="true" /> New test
        </button>
      </div>

      <p className="review-hint" role="status">
        {copyState === 'copied'
          ? 'The paper and your answers are on the clipboard. Paste them into a language model and ask it to grade.'
          : copyState === 'manual'
            ? 'Clipboard access was refused. Select the text below and copy it by hand.'
            : 'Both options produce the same Markdown: every question, its options, your answer, and grading instructions.'}
      </p>

      {copyState === 'manual' && (
        <textarea
          className="review-manual"
          ref={manualRef}
          readOnly
          rows={10}
          aria-label="Test paper for copying"
          value={document_}
        />
      )}

      <ol className="review-list">
        {test.answers.map((answer, position) => {
          const chosen = answer.question.options.find(option => option.label === answer.selected);
          return (
            <li key={answer.question.id} className="review-item">
              <p className="review-stem">
                <span className="review-number">{position + 1}</span>
                {toSingleLine(answer.question.stem)}
              </p>
              <p className={answer.selected ? 'review-answer' : 'review-answer is-blank'}>
                {chosen ? `${chosen.label}. ${toSingleLine(chosen.text)}` : 'Not answered'}
              </p>
            </li>
          );
        })}
      </ol>

      <footer className="question-source">
        <span className="question-source-line">
          Nothing above is marked correct. Every question is an unreviewed extraction from a past
          paper, so check the grading you get back against a trusted source.
        </span>
      </footer>
    </section>
  );
}
