import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import TestReview from '../practice/TestReview';
import { formatDuration } from '../practice/export';
import { whenTaken } from './PastTestsTable';
import { fetchTest, toCompletedTest, type TestDetail } from './api';

/** One past sitting, reviewed with every option shown and the chosen one
 *  marked, and the same export controls as a paper just finished. */
export default function PastTestView({ id, onBack }: { id: string; onBack: () => void }) {
  const [detail, setDetail] = useState<TestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt(count => count + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchTest(id, controller.signal)
      .then(setDetail)
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Something went wrong.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, attempt]);

  if (loading && !detail) {
    return (
      <section className="question-box">
        <p className="question-state" role="status">
          Loading that test…
        </p>
      </section>
    );
  }

  if (error || !detail) {
    return (
      <section className="question-box">
        <div className="question-state" role="alert">
          <h2 className="question-state-title">We couldn’t open that test.</h2>
          <p>{error || 'It may have been removed.'}</p>
          <div className="review-actions">
            <button type="button" className="button" onClick={retry}>
              <RotateCcw size={16} aria-hidden="true" /> Try again
            </button>
            <button type="button" className="link" onClick={onBack}>
              <ArrowLeft size={15} aria-hidden="true" /> Back
            </button>
          </div>
        </div>
      </section>
    );
  }

  const taken = whenTaken(detail.finishedAt);

  return (
    <TestReview
      test={toCompletedTest(detail)}
      title={`${taken.date} at ${taken.time}`}
      meta={`${detail.expired ? 'Time ran out' : 'Finished'} · ${formatDuration(detail.usedSeconds)}`}
      lead={
        <>
          You answered {detail.answeredCount} of {detail.questionCount} questions in{' '}
          {formatDuration(detail.usedSeconds)}, against a {detail.minutes} minute limit. Your answers
          are below, unmarked.
        </>
      }
      trailing={
        <button type="button" className="link" onClick={onBack}>
          <ArrowLeft size={15} aria-hidden="true" /> Back
        </button>
      }
    />
  );
}
