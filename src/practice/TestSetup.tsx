import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { DURATIONS, QUESTION_COUNTS, type TestConfig } from './types';

type Props = {
  busy: boolean;
  error: string;
  onStart: (config: TestConfig) => void;
};

/** Curate a test: how many questions, and how long to sit it. */
export default function TestSetup({ busy, error, onStart }: Props) {
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [minutes, setMinutes] = useState<number>(15);

  const perQuestion = Math.round((minutes * 60) / questionCount);

  return (
    <section className="question-box">
      <header className="question-meta">
        <span className="eyebrow">Practice test</span>
      </header>

      <h2 className="setup-title">Build your test.</h2>
      <p className="setup-lead">
        Questions are drawn at random from the bank. The countdown starts as soon as you begin.
      </p>

      <form
        className="setup-form"
        onSubmit={event => {
          event.preventDefault();
          onStart({ questionCount, minutes });
        }}
      >
        <div className="setup-fields">
          <label className="setup-field">
            Questions
            <select
              value={questionCount}
              onChange={event => setQuestionCount(Number(event.target.value))}
            >
              {QUESTION_COUNTS.map(count => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>

          <label className="setup-field">
            Minutes
            <select value={minutes} onChange={event => setMinutes(Number(event.target.value))}>
              {DURATIONS.map(duration => (
                <option key={duration} value={duration}>
                  {duration}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="setup-pace" role="status">
          {questionCount} questions in {minutes} minutes, about {perQuestion} seconds each.
        </p>

        {error && (
          <p className="question-message" role="alert">
            {error}
          </p>
        )}

        <div className="question-nav">
          <button type="submit" className="button nav-commit" disabled={busy}>
            {busy ? 'Drawing questions…' : 'Start test'}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </form>

      <footer className="question-source">
        <span className="question-source-line">
          The bank has no verified answer keys, so Pax does not score a test. At the end you can
          copy or export the paper with your answers for grading elsewhere.
        </span>
      </footer>
    </section>
  );
}
