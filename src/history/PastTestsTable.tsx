import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, Loader2, RotateCcw } from 'lucide-react';
import { formatDuration } from '../practice/export';
import { PAGE_SIZE, fetchTests, type TestSummary } from './api';

/** A readable stamp in the reader's own locale. */
export function whenTaken(iso: string): { date: string; time: string } {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return { date: iso, time: '' };
  return {
    date: at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
    time: at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
}

/** The ten most recent sittings, oldest paged away. Lives under the start
 *  control on the practice test screen. */
export default function PastTestsTable({ onOpen }: { onOpen: (id: string) => void }) {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<{ total: number; tests: TestSummary[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt(count => count + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchTests(offset, controller.signal)
      .then(setPage)
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Something went wrong.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [offset, attempt]);

  if (error) {
    return (
      <section className="history">
        <h3 className="history-heading">Past tests</h3>
        <p className="history-note" role="alert">
          {error}{' '}
          <button type="button" className="link" onClick={retry}>
            <RotateCcw size={14} aria-hidden="true" /> Try again
          </button>
        </p>
      </section>
    );
  }

  const tests = page?.tests ?? [];
  const total = page?.total ?? 0;

  if (!loading && page && !total) {
    return (
      <section className="history">
        <h3 className="history-heading">Past tests</h3>
        <p className="history-note">
          Nothing yet. Sit a test and it will be kept here with the answers you gave. Nothing is
          marked correct, because the bank has no verified answer keys.
        </p>
      </section>
    );
  }

  // Before the first page lands there are no rows, so stand in placeholder rows
  // of the right height under the overlay to keep the table from jumping.
  const skeleton = !page;
  const first = offset + 1;
  const last = offset + tests.length;

  return (
    <section className="history" aria-busy={loading}>
      <div className="history-head">
        <h3 className="history-heading">Past tests</h3>
        {page && (
          <span className="history-range">
            {first}–{last} of {total.toLocaleString()}
          </span>
        )}
      </div>

      <div className="history-table-wrap">
        <table className="history-table">
          <caption className="sr-only">
            Your past practice tests, most recent first. Choose one to review it.
          </caption>
          <thead>
            <tr>
              <th scope="col">Taken</th>
              <th scope="col">Questions</th>
              <th scope="col">Answered</th>
              <th scope="col">Time</th>
              <th scope="col">
                <span className="sr-only">Review</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {skeleton
              ? Array.from({ length: PAGE_SIZE }).map((_, row) => (
                  <tr key={row} className="history-skeleton" aria-hidden="true">
                    <th scope="row">
                      <span className="skeleton-bar" />
                    </th>
                    <td className="history-number">
                      <span className="skeleton-bar" />
                    </td>
                    <td className="history-number">
                      <span className="skeleton-bar" />
                    </td>
                    <td className="history-number">
                      <span className="skeleton-bar" />
                    </td>
                    <td className="history-chevron">
                      <ChevronRight size={16} aria-hidden="true" />
                    </td>
                  </tr>
                ))
              : tests.map(test => {
                  const taken = whenTaken(test.finishedAt);
                  return (
                    <tr key={test.id}>
                      <th scope="row">
                        <button type="button" className="history-open" onClick={() => onOpen(test.id)}>
                          <span className="history-date">{taken.date}</span>
                          <span className="history-time">{taken.time}</span>
                        </button>
                      </th>
                      {/* The label reads after the number on a narrow screen,
                          where the column headings are not shown. */}
                      <td className="history-number" data-label="questions">
                        {test.questionCount}
                      </td>
                      <td className="history-number" data-label="answered">
                        {test.answeredCount}
                      </td>
                      <td className="history-number">
                        {formatDuration(test.usedSeconds)}
                        {test.expired && <span className="history-flag">ran out</span>}
                      </td>
                      <td className="history-chevron">
                        <ChevronRight size={16} aria-hidden="true" />
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>

        {loading && (
          <div className="history-overlay" role="status" aria-label="Loading your past tests">
            <Loader2 className="spinner" size={22} aria-hidden="true" />
          </div>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="history-pager">
          <button
            type="button"
            className="link"
            onClick={() => setOffset(current => Math.max(0, current - PAGE_SIZE))}
            disabled={offset === 0 || loading}
          >
            <ArrowLeft size={15} aria-hidden="true" /> Newer
          </button>
          <button
            type="button"
            className="link"
            onClick={() => setOffset(current => current + PAGE_SIZE)}
            disabled={last >= total || loading}
          >
            Older
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      )}

      <p className="history-note">
        Kept for your account only. Nothing is marked correct, because the bank has no verified
        answer keys.
      </p>
    </section>
  );
}
