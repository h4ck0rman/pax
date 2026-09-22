import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import PastTestsTable from '../history/PastTestsTable';
import { DURATIONS, QUESTION_COUNTS, YEAR_FILTERS, type TestConfig } from './types';

type Props = {
  busy: boolean;
  error: string;
  onStart: (config: TestConfig) => void;
  /** Opens a past sitting for review. */
  onOpenPast: (id: string) => void;
};

/** Curate a test: how many questions, and how long to sit it. */
export default function TestSetup({ busy, error, onStart, onOpenPast }: Props) {
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [minutes, setMinutes] = useState<number>(15);
  const [minYear, setMinYear] = useState<number>(0);

  const perQuestion = Math.round((minutes * 60) / questionCount);
  const years = YEAR_FILTERS.find(entry => entry.minYear === minYear) ?? YEAR_FILTERS[0];

  return (
    <section className="question-box">
      <header className="question-meta">
        <span className="eyebrow">Practice test</span>
      </header>

      <h2 className="setup-title">Build your test.</h2>
      <p className="setup-lead">
        Questions are drawn at random from the papers you choose. The countdown starts as soon
        as you begin.
      </p>

      <form
        className="setup-form"
        onSubmit={event => {
          event.preventDefault();
          onStart({ questionCount, minutes, minYear });
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

          <label className="setup-field setup-field-wide">
            Papers
            <select value={minYear} onChange={event => setMinYear(Number(event.target.value))}>
              {YEAR_FILTERS.map(entry => (
                <option key={entry.minYear} value={entry.minYear}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="setup-pace" role="status">
          {questionCount} questions in {minutes} minutes, about {perQuestion} seconds each.
          {minYear
            ? ` Drawn from ${years.available.toLocaleString()} questions in papers from ${minYear} onwards.`
            : ` Drawn from all ${years.available.toLocaleString()} questions, including study material with no year on it.`}
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

      <PastTestsTable onOpen={onOpenPast} />
    </section>
  );
}
