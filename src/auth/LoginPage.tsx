import { useState, type FormEvent } from 'react';
import { ArrowLeft, CalendarRange, ClipboardCopy, Clock3 } from 'lucide-react';
import GoogleMark from './GoogleMark';
import VineArt from './VineArt';
import { requestAccess } from '../access/api';

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
    icon: Clock3,
    title: 'Practice tests',
    detail: 'Choose a length and a time limit, then sit it against a clock.',
  },
  {
    icon: CalendarRange,
    title: 'Papers by year',
    detail: 'Draw from every past paper, or from the recent years only.',
  },
  {
    icon: ClipboardCopy,
    title: 'Export for marking',
    detail: 'Copy or download a finished paper with your answers.',
  },
];

type RequestState = 'idle' | 'sending' | 'sent' | 'error';

export default function LoginPage({ reason }: { reason: string | null }) {
  const message = reason ? (MESSAGES[reason] ?? MESSAGES.google) : null;

  const [email, setEmail] = useState('');
  const [state, setState] = useState<RequestState>('idle');
  const [error, setError] = useState<string | null>(null);
  const busy = state === 'sending';

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setState('sending');
    setError(null);
    try {
      await requestAccess(email.trim());
      setState('sent');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send your request.');
      setState('error');
    }
  }

  return (
    <div className="login">
      {/* Decorative only, drawn inline so nothing is fetched. */}
      <div className="login-panel" aria-hidden="true">
        <VineArt />
      </div>

      <main className="login-main">
        <div className="login-column">
          <a className="login-back link" href="/">
            <ArrowLeft size={15} aria-hidden="true" /> Back
          </a>

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
          <a className="google-button login-google" href="/api/auth/google/start">
            <GoogleMark />
            <span>Continue with Google</span>
          </a>

          <p className="login-legal">
            By continuing, you agree to the <a href="/terms">terms of use</a> and the{' '}
            <a href="/privacy">privacy policy</a>.
          </p>

          {/* Request access. The divider is a short rule, not a full-width line,
              just enough to set this apart from the sign-in action above. */}
          <form className="login-request" onSubmit={handleRequest}>
            <hr className="login-request-rule" />
            {state === 'sent' ? (
              <p className="login-request-done" role="status">
                Thanks — your request is in. We&rsquo;ll let you in once it&rsquo;s approved.
              </p>
            ) : (
              <>
                <label className="login-request-label" htmlFor="access-email">
                  Not invited yet? Join the access list.
                </label>
                <div className="login-request-row">
                  <input
                    id="access-email"
                    className="login-request-input"
                    type="email"
                    name="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    disabled={busy}
                  />
                  <button className="login-request-button" type="submit" disabled={busy}>
                    {busy ? 'Sending…' : 'Join'}
                  </button>
                </div>
                {state === 'error' && error && (
                  <p className="login-error login-request-error" role="alert">
                    {error}
                  </p>
                )}
              </>
            )}
          </form>

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
