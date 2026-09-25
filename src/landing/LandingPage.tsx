import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Heart,
  LogIn,
  Moon,
  Salad,
  Sparkles,
  Sprout,
  Waves,
  Wind,
} from 'lucide-react';
import VineArt from '../auth/VineArt';

/** The sign-in page, which holds the Google button. A failed sign-in lands
 *  there rather than here, so this page has no error state. */
const SIGN_IN = '/login';

/** The countdown target. Update this to the next sitting's start.
 *  Kept as a real Date so the arithmetic is unambiguous across DST. */
const EXAM_DATE = new Date('2027-02-16T09:00:00+11:00');
const EXAM_LABEL = 'Tuesday 16 February 2027';

/** Rotating supportive lines in the hero. Kept short so each fits on one line
 *  at wide widths, and gentle rather than performative. */
const AFFIRMATIONS = [
  'You have already done the hard work.',
  'One question at a time is enough.',
  'You are more prepared than you feel.',
  'Rest is part of studying.',
  'The knowledge is already in you.',
  'You are enough, exactly as you are.',
];

/** The secret-admirer carousel. Four little notes on the white card, cycled
 *  automatically and jumpable by dot. In-jokes only she will recognise. */
const ADMIRER_NOTES = [
  'To the cute girl who has been going to the library and the cafe every weekend for the past three years. How about we grab a coffee and study at the same table next time? ;)',
  'I built this so the practice bit could feel quiet, and so you would have a place to come back to that is only about you and this exam. Whatever the paper says on the day, I am already so proud of you. Have a snack. Drink some water.',
  'Roses are red, violets are blue, of all the candidates walking into that exam room, my favourite is you.',
  'Please remember your acronyms for BPT. Most important ones first. U R A Q T.',
];

/** Wellbeing pillars for exam prep. Each one is a thing the evidence keeps
 *  landing on: sleep for memory, movement for cortisol, food and water for
 *  steady focus, breath for a spiralling mind, real breaks over long sits,
 *  and self-kindness because the tone you use with yourself is the tone the
 *  next hour will have. */
const SUPPORT = [
  {
    icon: Moon,
    title: 'Sleep on it',
    detail:
      'Seven to nine hours, at roughly the same time each night. Memory is consolidated in sleep, so a rested read beats another late one.',
  },
  {
    icon: Sprout,
    title: 'Move a little',
    detail:
      'A twenty minute walk lowers cortisol and lifts mood more reliably than another cup of coffee. Fresh air counts twice.',
  },
  {
    icon: Salad,
    title: 'Eat and drink',
    detail:
      'Protein, some colour on the plate, water beside you. Steady blood sugar keeps attention steadier than the sugar crash after a quick fix.',
  },
  {
    icon: Wind,
    title: 'Breathe slowly',
    detail:
      'Four in, four hold, four out, four hold. Two minutes of that settles a racing pulse and clears the head before the next question.',
  },
  {
    icon: Waves,
    title: 'Take real breaks',
    detail:
      'Fifty minutes on, ten minutes off, off the screen. Stand up, stretch, look at something far away. Come back with a fresh page.',
  },
  {
    icon: Heart,
    title: 'Be kind to you',
    detail:
      'Talk to yourself the way you would talk to a friend sitting the same paper. Worth is not a mark. You have already done the hard work.',
  },
];

interface RemainingParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  past: boolean;
}

function remaining(target: Date, now: Date): RemainingParts {
  const ms = target.getTime() - now.getTime();
  const past = ms <= 0;
  const total = Math.abs(ms);
  const days = Math.floor(total / 86_400_000);
  const hours = Math.floor((total % 86_400_000) / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  return { days, hours, minutes, seconds, past };
}

function AdmirerCard() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setActive(i => (i + 1) % ADMIRER_NOTES.length);
    }, 7000);
    return () => window.clearTimeout(id);
  }, [active]);
  return (
    <section className="admirer-section" aria-label="From a secret admirer">
      <div className="admirer">
        <p className="admirer-eyebrow">
          <Heart size={13} aria-hidden="true" /> From a secret admirer
        </p>
        <div className="admirer-stage" aria-live="polite">
          {ADMIRER_NOTES.map((note, i) => (
            <p
              key={note}
              className={`admirer-note${i === active ? ' is-active' : ''}`}
              aria-hidden={i !== active}
            >
              {note}
            </p>
          ))}
        </div>
        <ol className="admirer-dots" role="tablist" aria-label="Choose a message">
          {ADMIRER_NOTES.map((_, i) => (
            <li key={i}>
              <button
                type="button"
                role="tab"
                aria-selected={i === active}
                aria-label={`Message ${i + 1} of ${ADMIRER_NOTES.length}`}
                className={`admirer-dot${i === active ? ' is-active' : ''}`}
                onClick={() => setActive(i)}
              />
            </li>
          ))}
        </ol>
        <p className="admirer-signoff">-P</p>
        <a className="admirer-cta" href={SIGN_IN}>
          Open Pax <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

function Affirmations() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex(i => (i + 1) % AFFIRMATIONS.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, []);
  return (
    <p className="hero-affirmations" aria-live="polite">
      {AFFIRMATIONS.map((line, i) => (
        <span key={line} className={i === index ? 'is-active' : ''} aria-hidden={i !== index}>
          {line}
        </span>
      ))}
    </p>
  );
}

function CountdownSection() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const parts = remaining(EXAM_DATE, now);
  const cells: Array<[number, string]> = [
    [parts.days, parts.days === 1 ? 'day' : 'days'],
    [parts.hours, parts.hours === 1 ? 'hour' : 'hours'],
    [parts.minutes, parts.minutes === 1 ? 'min' : 'mins'],
    [parts.seconds, parts.seconds === 1 ? 'sec' : 'secs'],
  ];
  return (
    <section className="countdown-section" aria-labelledby="countdown-title">
      <div className="countdown-art" aria-hidden="true">
        <VineArt />
      </div>
      <div className="countdown-inner">
        <p className="countdown-eyebrow">
          <Sparkles size={14} aria-hidden="true" /> For Harpreet
        </p>
        <h2 id="countdown-title" className="countdown-title">
          {parts.past ? 'The exam has started. You are ready.' : 'Until the written exam'}
        </h2>
        <ol
          className="countdown-grid"
          aria-label={parts.past ? 'Time since the exam started' : 'Time until the exam starts'}
        >
          {cells.map(([value, label]) => (
            <li key={label}>
              <span className="countdown-value">{String(value).padStart(2, '0')}</span>
              <span className="countdown-label">{label}</span>
            </li>
          ))}
        </ol>
        <p className="countdown-date">{EXAM_LABEL}</p>
      </div>
    </section>
  );
}

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
          <p className="hero-eyebrow">
            <Sparkles size={13} aria-hidden="true" /> For Harpreet
          </p>
          <h1 className="hero-title">You've got this, Harpreet.</h1>
          <p className="hero-lead">
            A little space to count down to the exam and remember to look after yourself along
            the way. Deep breath. You are doing beautifully.
          </p>

          <Affirmations />

          <a className="hero-scroll" href="#countdown-title">
            See how close it is <ArrowDown size={15} aria-hidden="true" />
          </a>
        </div>
      </section>

      <main>
        <AdmirerCard />

        <CountdownSection />

        <section className="support-section" id="support">
          <p className="section-title">Six ways to hold yourself up</p>
          <h2 className="support-heading">
            Studying is the work. This is the frame around the work.
          </h2>
          <p className="support-lead">
            None of these are radical. They are the things the evidence keeps landing on for
            people in exam seasons, and the things easiest to let slip when the week is heavy.
            Pick one to protect this week and start there.
          </p>
          <ul className="support-cards">
            {SUPPORT.map(({ icon: Icon, title, detail }) => (
              <li key={title}>
                <span className="support-icon">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{detail}</p>
              </li>
            ))}
          </ul>
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
              <a href="#countdown-title">Countdown</a>
              <a href="#support">Support</a>
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
