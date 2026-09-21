import { ArrowLeft } from 'lucide-react';

export type LegalDocument = 'terms' | 'privacy';

/** Plain, honest policy text. These pages are public, because Google's consent
 *  screen requires reachable terms and privacy URLs, and because a reader should
 *  be able to read them before handing over an account. */
export default function LegalPage({ document }: { document: LegalDocument }) {
  return (
    <div className="app">
      <header className="app-header">
        <a className="logo" href="/" aria-label="Pax home">
          pax<span aria-hidden="true">.</span>
        </a>
        <a className="link" href="/">
          <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
        </a>
      </header>

      <main className="app-main">
        <article className="question-box legal">
          {document === 'terms' ? <Terms /> : <Privacy />}
        </article>
      </main>

      <footer className="app-footer">
        <span className="wordmark">pax</span>
      </footer>
    </div>
  );
}

function Terms() {
  return (
    <>
      <span className="eyebrow">Terms of use</span>
      <h1 className="legal-title">Terms of use</h1>
      <p className="legal-updated">Last updated 21 September 2026</p>

      <h2>What Pax is</h2>
      <p>
        Pax is a private study tool. It shows multiple-choice question candidates that were
        extracted automatically from past Basic Physician Training papers held by the study group
        that runs it. Access is limited to accounts the operator has invited.
      </p>

      <h2>Not medical advice, and not verified</h2>
      <p>
        Every question in Pax is an unreviewed extraction. No answer key has been verified, so Pax
        never marks an answer correct and never produces a score. Nothing in Pax is medical advice
        or a reliable statement of clinical fact. Check everything against a trusted source before
        relying on it, in study or in practice.
      </p>

      <h2>Your use of it</h2>
      <p>
        Use Pax for your own study. Do not share your access with anyone else, and do not
        redistribute the question content. If you export a test for grading elsewhere, you are
        responsible for where you send it and what that service does with it.
      </p>

      <h2>Availability</h2>
      <p>
        Pax is provided as it is, with no promise that it will be available, accurate or complete.
        The operator may change it, or withdraw your access, at any time.
      </p>

      <h2>Contact</h2>
      <p>Ask the person who invited you, who operates this deployment.</p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <span className="eyebrow">Privacy policy</span>
      <h1 className="legal-title">Privacy policy</h1>
      <p className="legal-updated">Last updated 21 September 2026</p>

      <h2>What Pax collects</h2>
      <p>
        When you sign in with Google, Pax receives your Google account identifier, your name and
        your email address. That is all it asks Google for, and it asks for no access to your Gmail,
        Drive or any other Google service.
      </p>

      <h2>What Pax stores</h2>
      <p>
        Pax stores that identifier, name and email address so it can recognise you, together with
        the times you signed in. For each sign-in it also stores a session record holding a random
        session identifier, when it was created, when it was last used, when it expires and your
        browser's user agent string. Sessions are deleted automatically once they pass their final
        expiry.
      </p>

      <h2>What Pax does not do</h2>
      <p>
        Pax has no analytics, no advertising and no third-party trackers. It loads no scripts from
        other sites. It does not sell or share your information. Your answers to questions are held
        in your browser for the length of a session only, and are not saved on the server.
      </p>

      <h2>Cookies</h2>
      <p>
        Pax sets one cookie to keep you signed in, and briefly sets a second while a sign-in is in
        progress. Both are restricted to Pax, are not readable by scripts in the page, and are used
        for nothing but signing you in. There are no other cookies.
      </p>

      <h2>Where it is held</h2>
      <p>
        Account and session records are held in a MongoDB Atlas database controlled by the operator
        of this deployment. The application runs on Vercel.
      </p>

      <h2>Removing your data</h2>
      <p>
        Signing out ends your session immediately. Ask the operator to remove your account, and your
        user and session records will be deleted.
      </p>
    </>
  );
}
