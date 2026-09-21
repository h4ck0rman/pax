import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { toParagraphs, toSingleLine } from './text';
import type { Question } from './types';

type Props = {
  question: Question;
  /** How many questions have been shown in this session, starting at 1. */
  position: number;
  /** Context shown opposite the number, such as the size of the bank or the
   *  length of a test. Never the question's index. */
  count?: ReactNode;
  selected: string | null;
  /** Once submitted the options are locked, but stay focusable for review. */
  submitted: boolean;
  onSelect: (label: string) => void;
  busy?: boolean;
  /** Navigation for the surrounding feature, placed under the options. */
  children?: ReactNode;
};

/** One question in a white card. There are no verified answer keys, so a
 *  selection is recorded and never marked correct or scored. */
export default function QuestionBox({
  question,
  position,
  count,
  selected,
  submitted,
  onSelect,
  busy = false,
  children,
}: Props) {
  return (
    <section className="question-box" aria-labelledby="question-stem" aria-busy={busy}>
      <header className="question-meta">
        <span className="eyebrow">Question {position}</span>
        {count ? <span className="question-count">{count}</span> : null}
      </header>

      <h2 className="question-stem" id="question-stem">
        {toParagraphs(question.stem).map((paragraph, block) => (
          <span className="question-stem-block" key={block}>
            {paragraph}{' '}
          </span>
        ))}
      </h2>

      <div className="question-options" role="group" aria-label="Answer options">
        {question.options.map(option => {
          const isSelected = selected === option.label;
          return (
            <button
              type="button"
              key={option.label}
              className="option"
              aria-pressed={isSelected}
              aria-disabled={submitted}
              onClick={() => {
                if (!submitted) onSelect(option.label);
              }}
            >
              <span className="option-letter" aria-hidden="true">
                {option.label}
              </span>
              <span className="option-text">{toSingleLine(option.text)}</span>
              <span className="option-mark" aria-hidden="true">
                {isSelected && <Check size={15} />}
              </span>
            </button>
          );
        })}
      </div>

      {children}

      {question.source && (
        <footer className="question-source">
          <span className="question-source-file">
            {question.source.source.split(/[\\/]/).pop()}
          </span>
          <span className="question-source-line">
            {question.source.original_number
              ? `Original question ${question.source.original_number} · `
              : ''}
            {question.source.start} · Extracted, not yet reviewed
          </span>
        </footer>
      )}
    </section>
  );
}
