import { ArrowDown, ArrowRight, BookOpen, ClipboardCopy, Clock3, LogIn } from 'lucide-react';
import VineArt from '../auth/VineArt';

/** The sign-in page, which holds the Google button. A failed sign-in lands
 *  there rather than here, so this page has no error state. */
const SIGN_IN = '/login';

const FEATURES = [
  {
    icon: BookOpen,
    title: 'Question bank',
    detail:
      'Open on the first question and draw at random from there. Back returns to anything you have already seen, with your answer still on it.',
  },
  {
    icon: Clock3,
    title: 'Practice tests',
    detail:
      'Pick a length and a time limit, then sit it against a countdown. Pause stops the clock and hides the question, so a break costs you nothing.',
  },
  {
    icon: ClipboardCopy,
    title: 'Export for marking',
    detail:
      'Finish a paper and copy or download it, questions and your answers together, ready to hand to a language model for grading.',
  },
];

const STEPS = [
  { number: '01', title: 'Sign in', detail: 'One Google account, on the invite list.' },
  {
    number: '02',
    title: 'Work through questions',
    detail: 'A bank to browse, or a paper against the clock.',
  },
  {
    number: '03',
    title: 'Take it away',
    detail: 'Export the paper with your answers for marking elsewhere.',
  },
];

export default function LandingPage() {
  return (
    <div className="landing">
      {/* The hero is the artwork: the header sits on it, so signing in is the
          only control above the fold. */}
      <section className="hero">
        <div className="hero-art" aria-hidden="true">
          <VineArt />
        </div>

        <header className="hero-top">
          <a className="logo" href="/" aria-label="Pax home">
            pax<span aria-hidden="true">.</span>
          </a>

          <nav className="app-nav" aria-label="Account">
            <a className="nav-item" href={SIGN_IN}>
              <LogIn size={16} aria-hidden="true" /> Sign in
            </a>
          </nav>
        </header>

        <div className="hero-body">
          <p className="hero-eyebrow">Basic Physician Training</p>
          <h1 className="hero-title">Good Luck Harpreet</h1>
          <p className="hero-lead">
            A calm place to work through questions from past papers. No streaks, no scores out of
            nowhere, no noise. Just the next question.
          </p>

          <a className="hero-scroll" href="#what-is-in-it">
            See what is in it <ArrowDown size={15} aria-hidden="true" />
          </a>
        </div>
      </section>

      <main>
        <section className="intro-section" id="what-is-in-it">
          <h2 className="intro-title">Thousands of questions, pulled from the real papers.</h2>
          <p className="intro-lead">
            Every question in Pax was extracted from past exam material held by the study group, on
            one machine, without sending a word of it to anyone.
          </p>
          <dl className="intro-stats">
            <div>
              <dt>5,374</dt>
              <dd>question candidates served</dd>
            </div>
            <div>
              <dt>7</dt>
              <dd>document formats read</dd>
            </div>
            <div>
              <dt>0</dt>
              <dd>answers invented</dd>
            </div>
          </dl>
        </section>

        <section className="features-section">
          <h2 className="section-title">What you get</h2>
          <ul className="feature-cards">
            {FEATURES.map(({ icon: Icon, title, detail }) => (
              <li key={title}>
                <span className="feature-icon">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="steps-section">
          <h2 className="section-title">How it goes</h2>
          <ol className="steps">
            {STEPS.map(({ number, title, detail }) => (
              <li key={number}>
                <span className="step-number">{number}</span>
                <h3>{title}</h3>
                <p>{detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="honest-section">
          <div className="honest-art" aria-hidden="true">
            <VineArt />
          </div>
          <div className="honest-inner">
            <h2 className="band-title">Nothing here is marked correct.</h2>
            <p className="band-lead">
              The questions were extracted automatically and never medically reviewed, and no answer
              key has been verified. So Pax records what you chose and stops there. It never scores a
              paper, and it never tells you an option is right. Check everything against a source you
              trust.
            </p>
            <a className="honest-cta" href={SIGN_IN}>
              Sign in to Pax <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-brand">
            <span className="wordmark">pax</span>
            <p>A little space to learn.</p>
          </div>

          <nav className="landing-footer-links" aria-label="Footer">
            <div>
              <h2>Pax</h2>
              <a href={SIGN_IN}>Sign in</a>
              <a href="#what-is-in-it">What is in it</a>
            </div>
            <div>
              <h2>Legal</h2>
              <a href="/terms">Terms of use</a>
              <a href="/privacy">Privacy policy</a>
            </div>
          </nav>
        </div>

        <p className="landing-footer-note">
          For study only, and not a source of medical advice. Questions are unreviewed extractions
          from past papers, held privately for an invited group.
        </p>
      </footer>
    </div>
  );
}
