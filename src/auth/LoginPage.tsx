import { BookOpen, Clock3, ClipboardCopy } from 'lucide-react';
import GoogleMark from './GoogleMark';
import VineArt from './VineArt';

/** Reasons the callback can hand back. Deliberately vague about why a
 *  particular address was refused. */
const MESSAGES: Record<string, string> = {
  denied: 'Sign-in was cancelled.',
  expired: 'That sign-in took too long. Please try again.',
  state: 'That sign-in could not be verified. Please try again.',
  google: 'Google could not complete the sign-in. Please try again.',
  not_allowed: 'That account does not have access to this question bank.',
  config: 'Sign-in is not configured on this deployment yet.',
};

const FEATURES = [
  {
    icon: BookOpen,
    title: 'Question bank',
    detail: 'Thousands of candidates pulled from past papers, one at a time.',
  },
  {
    icon: Clock3,
    title: 'Practice tests',
    detail: 'Choose a length and a time limit, then sit it against a clock.',
  },
  {
    icon: ClipboardCopy,
    title: 'Export for marking',
    detail: 'Copy or download a finished paper with your answers.',
  },
];

export default function LoginPage({ reason }: { reason: string | null }) {
  const message = reason ? (MESSAGES[reason] ?? MESSAGES.google) : null;

  return (
    <div className="login">
      {/* Decorative only, drawn inline so nothing is fetched. */}
      <div className="login-panel" aria-hidden="true">
        <VineArt />
      </div>

      <main className="login-main">
        <div className="login-column">
          <span className="login-logo">
            pax<span aria-hidden="true">.</span>
          </span>

          <h1 className="login-title">A little space to learn.</h1>
          <p className="login-lead">
            A calm study companion for Basic Physician Training, built around questions from past
            papers.
          </p>

          {message && (
            <p className="login-error" role="alert">
              {message}
            </p>
          )}

          {/* A plain link, so the browser performs the redirect itself and no
              third-party script is loaded into the page. */}
          <a className="google-button" href="/api/auth/google/start">
            <GoogleMark />
            <span>Continue with Google</span>
          </a>

          <p className="login-legal">
            By continuing, you agree to the <a href="/terms">terms of use</a> and the{' '}
            <a href="/privacy">privacy policy</a>.
          </p>

          <ul className="login-features">
            {FEATURES.map(({ icon: Icon, title, detail }) => (
              <li key={title}>
                <Icon size={17} aria-hidden="true" />
                <span>
                  <strong>{title}</strong>
                  {detail}
                </span>
              </li>
            ))}
          </ul>

          <p className="login-note">
            Access is limited to invited accounts. Pax receives your name and email address from
            Google, and nothing else. Every question is an unreviewed extraction, and no answers are
            verified.
          </p>
        </div>
      </main>
    </div>
  );
}
