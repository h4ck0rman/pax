import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Check, ClipboardCopy, Download, X } from 'lucide-react';
import { toParagraphs, toSingleLine } from '../questions/text';
import { buildFileName, buildGradingDocument, formatDuration } from './export';
import type { CompletedTest } from './types';
import Confetti from './Confetti';

/** Fire the celebration when the candidate lined up with the AI suggestion on at
 *  least this share of the whole test. This is agreement with an unverified
 *  model, never a verified score. */
const CELEBRATE_RATE = 0.9;

type Props = {
  test: CompletedTest;
  /** Heading for the card. The sitting says what just happened; history says when. */
  title: string;
  meta?: ReactNode;
  lead?: ReactNode;
  /** An extra control beside the export buttons. */
  trailing?: ReactNode;
};

type CopyState = 'idle' | 'copied' | 'manual';

/** A finished paper: every question with all of its options, the chosen one
 *  marked, and the two ways to take it away for marking. Nothing is scored,
 *  because the bank has no verified answer keys. */
export default function TestReview({ test, title, meta, lead, trailing }: Props) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const manualRef = useRef<HTMLTextAreaElement>(null);

  const answered = test.answers.filter(answer => answer.selected).length;
  const hasEstimates = test.answers.some(answer => answer.question.ai_estimate?.choice_label != null);

  // How many of the whole test matched the AI suggestion, shown as a simple
  // out-of-total score. Not a verified score: there is no answer key, so an
  // unanswered question or one the model never saw simply does not count as a
  // match.
  const total = test.answers.length;
  const matched = test.answers.filter(
    answer =>
      answer.selected != null && answer.selected === answer.question.ai_estimate?.choice_label,
  ).length;
  const matchRate = total ? matched / total : 0;
  const celebrate = total > 0 && matchRate >= CELEBRATE_RATE;

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
      {celebrate && <Confetti />}
      <header className="question-meta">
        <span className="eyebrow">Practice test</span>
        <span className="question-count">
          {meta ?? (
            <>
              {test.expired ? 'Time ran out' : 'Finished'} · {formatDuration(test.usedSeconds)}
            </>
          )}
        </span>
      </header>

      <h2 className="setup-title">{title}</h2>
      <p className="setup-lead">
        {lead ?? (
          <>
            You answered {answered} of {test.answers.length} questions in{' '}
            {formatDuration(test.usedSeconds)}, against a {test.config.minutes} minute limit. Pax
            does not mark the paper, because the bank has no verified answer keys.
          </>
        )}
      </p>

      {hasEstimates && (
        <div className={celebrate ? 'review-summary is-celebrating' : 'review-summary'}>
          <p className="review-summary-score">
            <strong>{matched}</strong>
            <span className="review-summary-total">/{total}</span>
          </p>
          <p className="review-summary-note">
            {celebrate ? 'Brilliant. ' : ''}
            right. Correct answers are green, wrong picks red. These are an AI model's answers with
            its own confidence, not a verified key, so double-check anything that matters.
          </p>
        </div>
      )}

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

        {trailing}
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
          const estimate = answer.question.ai_estimate;
          const aiLabel = estimate?.choice_label ?? null;
          const aiPercent =
            typeof estimate?.confidence === 'number' ? Math.round(estimate.confidence * 100) : null;
          return (
            <li key={`${answer.question.id}-${position}`} className="review-item">
              <p className="review-stem">
                <span className="review-number">{position + 1}</span>
                <span>
                  {toParagraphs(answer.question.stem).map((paragraph, block) => (
                    <span className="review-stem-block" key={block}>
                      {paragraph}{' '}
                    </span>
                  ))}
                </span>
              </p>

              {/* The AI model's pick is marked correct (green); a chosen option
                  that is not the pick is marked wrong (red). Only graded where
                  the model has an answer. These picks are unverified, not a key. */}
              <ul className="review-options">
                {answer.question.options.map(option => {
                  const chosen = option.label === answer.selected;
                  const correct = aiLabel !== null && option.label === aiLabel;
                  const wrong = chosen && aiLabel !== null && !correct;
                  const classes = ['review-option'];
                  if (correct) classes.push('is-correct');
                  else if (wrong) classes.push('is-wrong');
                  else if (chosen) classes.push('is-chosen');
                  return (
                    <li key={option.label} className={classes.join(' ')}>
                      <span className="review-option-letter">{option.label}</span>
                      <span className="review-option-text">{toSingleLine(option.text)}</span>
                      {chosen && (
                        <span className="review-option-mark">
                          {wrong ? <X size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />} Your
                          answer
                        </span>
                      )}
                      {correct && aiPercent !== null && (
                        <span className="review-option-mark review-option-confidence">
                          <Check size={14} aria-hidden="true" /> confidence: {aiPercent}%
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {!answer.selected && <p className="review-blank">Not answered</p>}
            </li>
          );
        })}
      </ol>

      <footer className="question-source">
        <span className="question-source-line">
          {hasEstimates
            ? 'Correct answers are an AI model’s unverified picks with its confidence, not a verified answer key, and are absent where the model was not run. Every question is an unreviewed extraction from a past paper, so check against a trusted source.'
            : 'Nothing above is marked correct. Every question is an unreviewed extraction from a past paper, so check the grading you get back against a trusted source.'}
        </span>
      </footer>
    </section>
  );
}
