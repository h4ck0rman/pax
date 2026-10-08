import { useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import PastTestsTable from '../history/PastTestsTable';
import Dashboard from './Dashboard';
import {
  DURATIONS,
  QUESTION_COUNTS,
  SERVABLE_TOTAL,
  YEAR_OPTIONS,
  type TestConfig,
} from './types';

type Props = {
  busy: boolean;
  error: string;
  onStart: (config: TestConfig) => void;
  /** Opens a past sitting for review. */
  onOpenPast: (id: string) => void;
};

/** Curate a test: how many questions, how long, and which paper years. */
export default function TestSetup({ busy, error, onStart, onOpenPast }: Props) {
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [minutes, setMinutes] = useState<number>(15);
  const [years, setYears] = useState<number[]>([]);

  const perQuestion = Math.round((minutes * 60) / questionCount);
  const available = years.length
    ? YEAR_OPTIONS.filter(option => years.includes(option.year)).reduce(
        (sum, option) => sum + option.available,
        0,
      )
    : SERVABLE_TOTAL;

  const addYear = (year: number) =>
    setYears(current => (current.includes(year) ? current : [...current, year]));
  const removeYear = (year: number) =>
    setYears(current => current.filter(value => value !== year));

  const unpicked = YEAR_OPTIONS.filter(option => !years.includes(option.year));
  const pickedDesc = [...years].sort((a, b) => b - a);

  return (
    <section className="question-box">
      <Dashboard />

      <h2 className="setup-title">Build your test.</h2>
      <p className="setup-lead">
        Questions are drawn at random from the papers you choose. The countdown starts as soon
        as you begin.
      </p>

      <form
        className="setup-form"
        onSubmit={event => {
          event.preventDefault();
          onStart({ questionCount, minutes, years });
        }}
      >
        <div className="setup-fields">
          <label className="setup-field">
            Questions
            <span className="select-wrap">
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
            </span>
          </label>

          <label className="setup-field">
            Minutes
            <span className="select-wrap">
              <select value={minutes} onChange={event => setMinutes(Number(event.target.value))}>
                {DURATIONS.map(duration => (
                  <option key={duration} value={duration}>
                    {duration}
                  </option>
                ))}
              </select>
            </span>
          </label>
        </div>

        <div className="setup-papers">
          <label className="setup-papers-label" htmlFor="add-year">
            Papers
          </label>
          <span className="select-wrap">
            <select
              id="add-year"
              className="setup-select"
              value=""
              onChange={event => {
                const year = Number(event.target.value);
                if (year) addYear(year);
              }}
            >
              <option value="">
                {years.length ? 'Add another year…' : 'Any year (add years to narrow)'}
              </option>
              {unpicked.map(option => (
                <option key={option.year} value={option.year}>
                  {option.year} ({option.available})
                </option>
              ))}
            </select>
          </span>

          {pickedDesc.length > 0 && (
            <ul className="year-tags" aria-label="Chosen paper years">
              {pickedDesc.map(year => (
                <li className="year-tag" key={year}>
                  {year}
                  <button
                    type="button"
                    className="year-tag-remove"
                    aria-label={`Remove ${year}`}
                    onClick={() => removeYear(year)}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="setup-pace" role="status">
          {questionCount} questions in {minutes} minutes, about {perQuestion} seconds each.
          {years.length
            ? ` Drawn from ${available.toLocaleString()} questions across ${years.length} ${
                years.length === 1 ? 'year' : 'years'
              }.`
            : ` Drawn from all ${available.toLocaleString()} questions, including study material with no year on it.`}
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
