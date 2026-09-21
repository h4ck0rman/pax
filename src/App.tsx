import { useState } from 'react';
import { BookOpen, Clock3, LogOut } from 'lucide-react';
import QuestionBank from './questions/QuestionBank';
import PracticeTest from './practice/PracticeTest';
import LandingPage from './landing/LandingPage';
import LoginPage from './auth/LoginPage';
import LegalPage, { type LegalDocument } from './legal/LegalPage';
import { useAuth } from './auth/AuthProvider';

type Section = 'bank' | 'test';

const TITLES: Record<Section, string> = {
  bank: 'Question bank',
  test: 'Practice test',
};

/** The paths the app serves besides the root, all public. The policies must be
 *  readable before signing in, and reachable by Google's reviewers. */
function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

function legalDocument(path: string): LegalDocument | null {
  if (path === '/terms') return 'terms';
  if (path === '/privacy') return 'privacy';
  return null;
}

function signInReason(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('error');
}

export default function App() {
  const auth = useAuth();
  const [section, setSection] = useState<Section>('bank');
  // Choosing the current section again restarts it, by remounting the feature.
  const [restarts, setRestarts] = useState(0);

  const path = currentPath();
  const legal = legalDocument(path);
  if (legal) return <LegalPage document={legal} />;

  if (auth.status === 'signed-out') {
    // /login is the page with the button; / is the landing page.
    return path === '/login' ? <LoginPage reason={signInReason()} /> : <LandingPage />;
  }

  function choose(next: Section) {
    setSection(next);
    if (next === section) setRestarts(count => count + 1);
  }

  const signedIn = auth.status === 'signed-in';

  return (
    <div className="app">
      <header className="app-header">
        <a className="logo" href="/" aria-label="Pax home">
          pax<span aria-hidden="true">.</span>
        </a>

        {signedIn && (
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
        )}

        {signedIn && (
          <div className="app-account">
            <span className="app-account-email">{auth.user.email}</span>
            <button type="button" className="link" onClick={() => void auth.signOut()}>
              <LogOut size={15} aria-hidden="true" /> Sign out
            </button>
          </div>
        )}
      </header>

      <main className="app-main">
        <h1 className="sr-only">{signedIn ? TITLES[section] : 'Pax'}</h1>

        {auth.status === 'checking' ? (
          <section className="question-box">
            <p className="question-state" role="status">
              Checking your session…
            </p>
          </section>
        ) : auth.status === 'unavailable' ? (
          <section className="question-box">
            <div className="question-state" role="alert">
              <h2 className="question-state-title">Pax is unavailable.</h2>
              <p>Sign-in could not be reached. Please try again shortly.</p>
              <button type="button" className="button" onClick={auth.recheck}>
                Try again
              </button>
            </div>
          </section>
        ) : section === 'bank' ? (
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
