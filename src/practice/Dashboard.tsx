import { useEffect, useState } from 'react';
import { fetchStats, type TestStats } from '../history/api';
import { formatDuration } from './export';

/** A small row of aggregate numbers above the setup form. Hidden until there is
 *  at least one past sitting, so a first-time reader does not see empty tiles.
 *  The score is agreement with the AI answers, not a verified mark. */
export default function Dashboard() {
  const [stats, setStats] = useState<TestStats | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchStats(controller.signal)
      .then(setStats)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  if (!stats || stats.testsTaken === 0) return null;

  const tiles = [
    { label: 'Tests taken', value: String(stats.testsTaken) },
    {
      label: 'Avg score',
      note: 'vs AI answers',
      value: stats.scorePercent === null ? '—' : `${stats.scorePercent}%`,
    },
    { label: 'Questions answered', value: stats.questionsAnswered.toLocaleString() },
    { label: 'Avg time', value: stats.avgSeconds === null ? '—' : formatDuration(stats.avgSeconds) },
  ];

  return (
    <section className="dashboard" aria-label="Your progress so far">
      {tiles.map(tile => (
        <div className="dashboard-tile" key={tile.label}>
          <span className="dashboard-value">{tile.value}</span>
          <span className="dashboard-label">
            {tile.label}
            {tile.note ? <span className="dashboard-note"> {tile.note}</span> : null}
          </span>
        </div>
      ))}
    </section>
  );
}
