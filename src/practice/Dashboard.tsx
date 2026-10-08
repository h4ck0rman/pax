import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchStats, type TestStats } from '../history/api';
import { formatDuration } from './export';

/** A small row of aggregate numbers above the setup form. The four tiles are
 *  rendered at full size straight away with one loading overlay across them, so
 *  the layout does not jump when the data arrives. Hidden once loaded if there
 *  is no sitting yet. The score is agreement with the AI answers, not a mark. */
export default function Dashboard() {
  const [stats, setStats] = useState<TestStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchStats(controller.signal)
      .then(setStats)
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  // Once loaded, there is nothing to show for a reader with no sittings yet.
  if (!loading && (!stats || stats.testsTaken === 0)) return null;

  const tiles = [
    { label: 'Tests taken', value: stats ? String(stats.testsTaken) : '' },
    {
      label: 'Avg score',
      note: 'vs AI answers',
      value: stats ? (stats.scorePercent === null ? '—' : `${stats.scorePercent}%`) : '',
    },
    { label: 'Questions answered', value: stats ? stats.questionsAnswered.toLocaleString() : '' },
    { label: 'Avg time', value: stats ? (stats.avgSeconds === null ? '—' : formatDuration(stats.avgSeconds)) : '' },
  ];

  return (
    <section
      className={loading ? 'dashboard is-loading' : 'dashboard'}
      aria-label="Your progress so far"
      aria-busy={loading}
    >
      {tiles.map(tile => (
        <div className="dashboard-tile" key={tile.label}>
          <span className="dashboard-value">{tile.value || ' '}</span>
          <span className="dashboard-label">
            {tile.label}
            {tile.note ? <span className="dashboard-note"> {tile.note}</span> : null}
          </span>
        </div>
      ))}
      {loading && (
        <div className="dashboard-overlay" role="status" aria-label="Loading your progress">
          <Loader2 className="spinner" size={22} aria-hidden="true" />
        </div>
      )}
    </section>
  );
}
