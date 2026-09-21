import { useState } from 'react';
import { BookOpen, Clock3 } from 'lucide-react';
import QuestionBank from './questions/QuestionBank';
import PracticeTest from './practice/PracticeTest';

type Section = 'bank' | 'test';

const TITLES: Record<Section, string> = {
  bank: 'Question bank',
  test: 'Practice test',
};

export default function App() {
  const [section, setSection] = useState<Section>('bank');
  // Choosing the current section again restarts it, by remounting the feature.
  const [restarts, setRestarts] = useState(0);

  function choose(next: Section) {
    setSection(next);
    if (next === section) setRestarts(count => count + 1);
  }

  return (
    <div className="app">
      <header className="app-header">
        <a className="logo" href="/" aria-label="Pax home">
          pax<span aria-hidden="true">.</span>
        </a>

        <nav className="app-nav" aria-label="Sections">
          <button
            type="button"
            className="nav-item"
            aria-current={section === 'bank' ? 'page' : undefined}
            onClick={() => choose('bank')}
          >
            <BookOpen size={16} aria-hidden="true" /> Question bank
          </button>
          <button
            type="button"
            className="nav-item"
            aria-current={section === 'test' ? 'page' : undefined}
            onClick={() => choose('test')}
          >
            <Clock3 size={16} aria-hidden="true" /> Practice test
          </button>
        </nav>
      </header>

      <main className="app-main">
        <h1 className="sr-only">{TITLES[section]}</h1>
        {section === 'bank' ? (
          <QuestionBank key={`bank-${restarts}`} />
        ) : (
          <PracticeTest key={`test-${restarts}`} />
        )}
      </main>

      <footer className="app-footer">
        <span className="wordmark">pax</span>
      </footer>
    </div>
  );
}
