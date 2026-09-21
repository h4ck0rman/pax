import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, RotateCcw } from 'lucide-react';
import QuestionBox from './QuestionBox';
import { fetchQuestions } from './api';
import type { Question } from './types';

/** One question as it has been worked on during this session. */
type Entry = { question: Question; selected: string | null; submitted: boolean };

/** Questions drawn so far and where the reader is among them. Kept as one value
 *  so appending a draw and moving to it stays a single pure update. */
type Session = { entries: Entry[]; index: number };

/** The bank opens on the first question, then draws at random. The nonce gives
 *  each request an identity, so a retry refetches and a double-invoked effect
 *  cannot append the same draw twice. */
type Request = { kind: 'first' | 'random'; nonce: number };

export default function QuestionBank() {
  const [request, setRequest] = useState<Request>({ kind: 'first', nonce: 0 });
  const [session, setSession] = useState<Session>({ entries: [], index: 0 });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const appliedNonce = useRef(-1);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const query = request.kind === 'first' ? { offset: 0, limit: 1 } : { random: true, limit: 1 };
    fetchQuestions(query, controller.signal)
      .then(page => {
        if (appliedNonce.current === request.nonce) return;
        appliedNonce.current = request.nonce;
        setTotal(page.total);
        const drawn = page.questions[0];
        if (!drawn) return;
        setSession(current => ({
          entries: [...current.entries, { question: drawn, selected: null, submitted: false }],
          index: current.entries.length,
        }));
      })
      .catch((cause: unknown) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Something went wrong.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request]);

  const draw = useCallback((kind: Request['kind']) => {
    setRequest(current => ({ kind, nonce: current.nonce + 1 }));
  }, []);

  const goBack = useCallback(() => {
    setError('');
    setSession(current => ({ ...current, index: Math.max(0, current.index - 1) }));
  }, []);

  const { entries, index } = session;
  const current = entries[index];
  const atEnd = index >= entries.length - 1;

  /** Forward through questions already drawn, then draw a new one at the end. */
  const goNext = useCallback(() => {
    setError('');
    if (!atEnd) {
      setSession(state => ({
        ...state,
        index: Math.min(state.index + 1, state.entries.length - 1),
      }));
      return;
    }
    draw('random');
  }, [atEnd, draw]);

  const change = useCallback((apply: (entry: Entry) => Entry) => {
    setSession(state => ({
      ...state,
      entries: state.entries.map((entry, at) => (at === state.index ? apply(entry) : entry)),
    }));
  }, []);

  const select = useCallback(
    (label: string) => {
      change(entry =>
        entry.submitted ? entry : { ...entry, selected: entry.selected === label ? null : label },
      );
    },
    [change],
  );

  const submit = useCallback(() => {
    change(entry => (entry.selected ? { ...entry, submitted: true } : entry));
  }, [change]);

  if (!current) {
    if (loading) {
      return (
        <section className="question-box">
          <p className="question-state" role="status">
            Loading a question…
          </p>
        </section>
      );
    }
    if (error) {
      return (
        <section className="question-box">
          <div className="question-state" role="alert">
            <h2 className="question-state-title">We couldn’t load a question.</h2>
            <p>{error}</p>
            <button type="button" className="button" onClick={() => draw('first')}>
              <RotateCcw size={16} aria-hidden="true" /> Try again
            </button>
          </div>
        </section>
      );
    }
    return (
      <section className="question-box">
        <div className="question-state">
          <h2 className="question-state-title">No questions available.</h2>
          <p>The question bank returned nothing to show.</p>
        </div>
      </section>
    );
  }

  return (
    <QuestionBox
      question={current.question}
      position={index + 1}
      count={total > 0 ? `${total.toLocaleString()} in the bank` : null}
      selected={current.selected}
      submitted={current.submitted}
      onSelect={select}
      busy={loading}
    >
      {/* Outside the button row, so a message can never push it onto two lines. */}
      {error && (
        <p className="question-message" role="alert">
          {error}
        </p>
      )}

      <div className="question-nav">
        {current.submitted ? (
          <p className="question-submitted" role="status">
            <Check size={15} aria-hidden="true" /> Answer recorded
          </p>
        ) : (
          <button
            type="button"
            className="button nav-commit"
            onClick={submit}
            disabled={!current.selected || loading}
          >
            Submit answer
          </button>
        )}

        {/* Moving between questions is a quiet step, so these read as links.
            They stay real buttons because they act rather than navigate. */}
        <div className="nav-steps">
          <button
            type="button"
            className="link nav-back"
            onClick={goBack}
            disabled={index === 0 || loading}
          >
            <ArrowLeft size={15} aria-hidden="true" /> Back
          </button>

          <button type="button" className="link nav-forward" onClick={goNext} disabled={loading}>
            {loading ? 'Finding one…' : 'Next'}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </QuestionBox>
  );
}
