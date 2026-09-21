import { Clock3, Pause, Play, Square } from 'lucide-react';
import { formatClock } from './export';

type Props = {
  remainingSeconds: number;
  position: number;
  questionCount: number;
  answeredCount: number;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
};

/** Always-visible control bar for a sitting: how long is left, how far through
 *  the paper the candidate is, and the two ways to interrupt. */
export default function TestBar({
  remainingSeconds,
  position,
  questionCount,
  answeredCount,
  paused,
  onPause,
  onResume,
  onStop,
}: Props) {
  const answeredPercent = questionCount ? (answeredCount / questionCount) * 100 : 0;
  const lowOnTime = remainingSeconds <= 60;

  return (
    <div className="test-bar">
      <p className={lowOnTime ? 'test-clock is-low' : 'test-clock'} role="timer">
        <Clock3 size={17} aria-hidden="true" />
        <span className="sr-only">Time remaining </span>
        {formatClock(remainingSeconds)}
        {paused && <span className="test-paused-flag">Paused</span>}
      </p>

      <div className="test-progress">
        <p className="test-progress-text">
          Question {position} of {questionCount}
          <span className="test-answered">{answeredCount} answered</span>
        </p>
        <div
          className="test-progress-track"
          role="progressbar"
          aria-label="Questions answered"
          aria-valuenow={answeredCount}
          aria-valuemin={0}
          aria-valuemax={questionCount}
        >
          <span className="test-progress-fill" style={{ inlineSize: `${answeredPercent}%` }} />
        </div>
      </div>

      <div className="test-bar-actions">
        {paused ? (
          <button type="button" className="link" onClick={onResume}>
            <Play size={15} aria-hidden="true" /> Resume
          </button>
        ) : (
          <button type="button" className="link" onClick={onPause}>
            <Pause size={15} aria-hidden="true" /> Pause
          </button>
        )}

        <button type="button" className="link" onClick={onStop}>
          <Square size={14} aria-hidden="true" /> Stop
        </button>
      </div>
    </div>
  );
}
