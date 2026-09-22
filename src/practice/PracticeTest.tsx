import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Flag, Play, RotateCcw } from 'lucide-react';
import QuestionBox from '../questions/QuestionBox';
import { saveTest } from '../history/api';
import PastTestView from '../history/PastTestView';
import { fetchQuestions } from '../questions/api';
import TestBar from './TestBar';
import TestReview from './TestReview';
import TestSetup from './TestSetup';
import type { CompletedTest, TestAnswer, TestConfig } from './types';

type Phase = 'setup' | 'sitting' | 'review' | 'past';

/** The countdown. `runningSince` is null while paused, so paused time never
 *  counts against the candidate. */
type Clock = { remainingMs: number; runningSince: number | null };

const remainingMsOf = (clock: Clock, now: number) =>
  clock.runningSince === null
    ? clock.remainingMs
    : Math.max(0, clock.remainingMs - (now - clock.runningSince));

export default function PracticeTest() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [config, setConfig] = useState<TestConfig | null>(null);
  const [answers, setAnswers] = useState<TestAnswer[]>([]);
  const [index, setIndex] = useState(0);
  const [clock, setClock] = useState<Clock>({ remainingMs: 0, runningSince: null });
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [completed, setCompleted] = useState<CompletedTest | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState('');
  /** Null until a sitting has been kept, so a failure can be retried. */
  const [saveFailed, setSaveFailed] = useState(false);
  /** The past sitting being reviewed, if any. */
  const [pastId, setPastId] = useState<string | null>(null);

  // Read in the countdown effect, which must not restart on every answer.
  const latest = useRef({ answers, config, clock });
  latest.current = { answers, config, clock };

  /** Stable for one sitting, so saving is idempotent. */
  const sittingId = useRef<string | null>(null);

  /** Writes the sitting to the reader's history. The id is generated here, so a
   *  retry replaces the same record rather than adding a second row. */
  const keep = useCallback(async (record: CompletedTest) => {
    const id = sittingId.current ?? crypto.randomUUID();
    sittingId.current = id;
    try {
      await saveTest(record, id);
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }, []);

  const finish = useCallback((expired: boolean) => {
    const { answers: sat, config: sitting, clock: at } = latest.current;
    if (!sitting) return;
    const left = expired ? 0 : remainingMsOf(at, Date.now());
    setClock({ remainingMs: left, runningSince: null });
    const record: CompletedTest = {
      config: sitting,
      answers: sat,
      finishedAt: Date.now(),
      usedSeconds: Math.round((sitting.minutes * 60 * 1000 - left) / 1000),
      expired,
    };
    setCompleted(record);
    setPhase('review');
    // Keeping the sitting must never block the review screen.
    void keep(record);
  }, []);

  useEffect(() => {
    if (phase !== 'sitting' || clock.runningSince === null) return;
    const tick = () => {
      const left = remainingMsOf(latest.current.clock, Date.now());
      setRemainingSeconds(Math.ceil(left / 1000));
      if (left <= 0) finish(true);
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [phase, clock.runningSince, finish]);

  const start = useCallback(async (chosen: TestConfig) => {
    setDrawing(true);
    setError('');
    try {
      const page = await fetchQuestions({
        random: true,
        limit: chosen.questionCount,
        minYear: chosen.minYear,
      });
      // A random draw can repeat a document, so keep the first of each.
      const unique = [...new Map(page.questions.map(item => [item.id, item])).values()];
      if (!unique.length) {
        throw new Error(
          chosen.minYear
            ? `No questions are available from papers ${chosen.minYear} onwards.`
            : 'No questions are available right now.',
        );
      }
      setConfig({ ...chosen, questionCount: unique.length });
      setAnswers(unique.map(question => ({ question, selected: null })));
      setIndex(0);
      setClock({ remainingMs: chosen.minutes * 60 * 1000, runningSince: Date.now() });
      setRemainingSeconds(chosen.minutes * 60);
      setCompleted(null);
      sittingId.current = null;
      setSaveFailed(false);
      setPhase('sitting');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Could not start the test.');
    } finally {
      setDrawing(false);
    }
  }, []);

  const pause = useCallback(() => {
    setClock(current =>
      current.runningSince === null
        ? current
        : { remainingMs: remainingMsOf(current, Date.now()), runningSince: null },
    );
  }, []);

  const resume = useCallback(() => {
    setClock(current =>
      current.runningSince === null ? { ...current, runningSince: Date.now() } : current,
    );
  }, []);

  const select = useCallback((label: string) => {
    setAnswers(current =>
      current.map((answer, at) =>
        at === index ? { ...answer, selected: answer.selected === label ? null : label } : answer,
      ),
    );
  }, [index]);

  const restart = useCallback(() => {
    setPhase('setup');
    setConfig(null);
    setAnswers([]);
    setIndex(0);
    setCompleted(null);
    setClock({ remainingMs: 0, runningSince: null });
    setError('');
  }, []);

  if (phase === 'past' && pastId) {
    return (
      <PastTestView
        id={pastId}
        onBack={() => {
          setPastId(null);
          setPhase('setup');
        }}
      />
    );
  }

  if (phase === 'setup') {
    return (
      <TestSetup
        busy={drawing}
        error={error}
        onStart={start}
        onOpenPast={id => {
          setPastId(id);
          setPhase('past');
        }}
      />
    );
  }

  if (phase === 'review' && completed) {
    return (
      <TestReview
        test={completed}
        title={completed.expired ? 'Time is up.' : 'Test complete.'}
        trailing={
          <>
            <button type="button" className="link" onClick={restart}>
              <RotateCcw size={15} aria-hidden="true" /> New test
            </button>
            {saveFailed && (
              <button type="button" className="link" onClick={() => void keep(completed)}>
                <RotateCcw size={15} aria-hidden="true" /> Retry saving
              </button>
            )}
          </>
        }
      />
    );
  }

  const current = answers[index];
  if (!current || !config) return null;

  const paused = clock.runningSince === null;
  const answeredCount = answers.filter(answer => answer.selected).length;
  const onLast = index === answers.length - 1;

  return (
    <>
      <TestBar
        remainingSeconds={remainingSeconds}
        position={index + 1}
        questionCount={answers.length}
        answeredCount={answeredCount}
        paused={paused}
        onPause={pause}
        onResume={resume}
        onStop={() => finish(false)}
      />

      {paused ? (
        <section className="question-box">
          <div className="question-state">
            <h2 className="question-state-title">Paused.</h2>
            <p>
              The clock is stopped with {remainingSeconds >= 60 ? '' : 'only '}
              {Math.floor(remainingSeconds / 60)}m {remainingSeconds % 60}s left. The question is
              hidden until you carry on.
            </p>
            <button type="button" className="button" onClick={resume}>
              <Play size={16} aria-hidden="true" /> Resume test
            </button>
          </div>
        </section>
      ) : (
        <QuestionBox
          question={current.question}
          position={index + 1}
          count={`of ${answers.length}`}
          selected={current.selected}
          submitted={false}
          onSelect={select}
        >
          <div className="question-nav">
            {onLast && (
              <button type="button" className="button nav-commit" onClick={() => finish(false)}>
                <Flag size={16} aria-hidden="true" /> Finish test
              </button>
            )}

            <div className="nav-steps">
              <button
                type="button"
                className="link nav-back"
                onClick={() => setIndex(at => Math.max(0, at - 1))}
                disabled={index === 0}
              >
                <ArrowLeft size={15} aria-hidden="true" /> Back
              </button>

              <button
                type="button"
                className="link nav-forward"
                onClick={() => setIndex(at => Math.min(answers.length - 1, at + 1))}
                disabled={onLast}
              >
                Next
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </QuestionBox>
      )}
    </>
  );
}
