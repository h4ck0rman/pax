import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Clock3, MessageCircle, Search } from 'lucide-react';

type Question = { id: string; stem: string; options: { label: string; text: string }[]; source: { source: string; original_number: string; start: string } | null };
type Mode = 'bank' | 'exam';
export default function App() {
  const [mode, setMode] = useState<Mode>('bank');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [count, setCount] = useState(10);
  const [minutes, setMinutes] = useState(15);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [index, setIndex] = useState(0);
  const [complete, setComplete] = useState(false);
  const [retry, setRetry] = useState(0);
  const [botOpen, setBotOpen] = useState(false);
  const question = questions[mode === 'bank' ? 0 : index];
  const activeExam = mode === 'exam' && deadline !== null && !complete;
  useEffect(() => { const timer = setTimeout(() => { setQuery(search); setOffset(0); }, 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (mode !== 'bank') return;
    const controller = new AbortController(); setLoading(true); setError('');
    fetch(`/api/questions?offset=${offset}&search=${encodeURIComponent(query)}`, { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setQuestions(data.questions); setTotal(data.total); }).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [mode, offset, query, retry]);
  useEffect(() => {
    if (!activeExam || !deadline) return;
    const tick = () => { const time = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); setRemaining(time); if (!time) setComplete(true); };
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [deadline, activeExam]);
  function switchMode(next: Mode) { setMode(next); setDeadline(null); setComplete(false); setError(''); setIndex(0); setLoading(next === 'bank'); if (next === mode && next === 'bank') setRetry(r => r + 1); }
  async function startExam() {
    setLoading(true); setError('');
    try { const response = await fetch(`/api/questions?random=true&limit=${count}`); const data = await response.json(); if (!response.ok) throw new Error(data.error); if (!data.questions.length) throw new Error('No questions are available.'); setQuestions(data.questions); setAnswers({}); setIndex(0); setComplete(false); setDeadline(Date.now() + minutes * 60000); setRemaining(minutes * 60); } catch (e) { setError(e instanceof Error ? e.message : 'Could not start exam.'); } finally { setLoading(false); }
  }
  return <div className="app">
    <header className="header"><a className="logo" href="/" aria-label="Pax home">pax<span>●</span></a><nav aria-label="Main navigation"><button className={mode === 'bank' ? 'active' : ''} onClick={() => switchMode('bank')}><BookOpen size={17}/> Question bank</button><button className={mode === 'exam' ? 'active' : ''} onClick={() => switchMode('exam')}><Clock3 size={17}/> Practice exams</button></nav></header>
    <main className="workspace">
      <aside className="study-panel">
        <div><span className="eyebrow">{mode === 'bank' ? 'QUESTION BANK' : 'PRACTICE EXAM'}</span><h1>{complete ? 'Session complete' : activeExam || mode === 'bank' ? 'Question' : 'Session setup'}</h1></div>
        <div className="panel-middle"><span className="large-number">{mode === 'bank' ? String(total ? offset + 1 : 0).padStart(2, '0') : activeExam ? String(index + 1).padStart(2, '0') : String(count).padStart(2, '0')}</span><span className="panel-count">{mode === 'bank' ? `of ${total.toLocaleString()} questions` : activeExam ? `of ${questions.length} questions` : 'questions'}</span></div>
        {activeExam && <div className="panel-timer"><span className="eyebrow">TIME REMAINING</span><span className="timer" role="timer"><Clock3 size={18}/>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</span></div>}
        {!loading && !error && question?.source && (mode === 'bank' || activeExam) && <div className="panel-source"><span className="eyebrow">SOURCE</span><p>{question.source.source.split(/[\\/]/).pop()}</p><span>{question.source.original_number ? `Original question ${question.source.original_number} - ` : ''}{question.source.start}</span><details><summary>Full source <ChevronDown size={13}/></summary><p>{question.source.source}</p></details><span className="review-note">Extracted - not yet reviewed</span></div>}
        <div className="panel-bottom"><button className="bot-button" aria-expanded={botOpen} aria-controls="bot-placeholder" onClick={() => setBotOpen(open => !open)}><MessageCircle size={18}/> Ask paxBot <span>Preview</span></button>{botOpen && <p id="bot-placeholder" role="status">paxBot is coming soon. This preview does not send your question anywhere.</p>}</div>
      </aside>
      <section className="question-space">
        <div className="section-top"><span className="eyebrow">{mode === 'bank' ? 'QUESTION BANK' : 'PRACTICE EXAMS'}</span></div>
        {mode === 'bank' && <label className="search"><Search size={17}/><input aria-label="Search questions" placeholder="Find a question or topic" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button onClick={() => setSearch('')} aria-label="Clear search">×</button>}</label>}
        {error ? <div className="empty" role="alert"><h2>We couldn’t load the questions.</h2><p>{error}</p><button className="primary" onClick={() => mode === 'bank' ? setRetry(r => r + 1) : startExam()}>Try again <ArrowRight size={18}/></button></div>
        : mode === 'exam' && !deadline ? <div className="exam-setup"><h2>Set up your exam.</h2><p>Choose a question count and time limit.</p><div className="setup-fields"><label>Questions<select value={count} onChange={e => setCount(Number(e.target.value))}>{[5, 10, 20, 50].map(n => <option key={n}>{n}</option>)}</select></label><label>Minutes<select value={minutes} onChange={e => setMinutes(Number(e.target.value))}>{[5, 15, 30, 60].map(n => <option key={n}>{n}</option>)}</select></label></div><button disabled={loading} className="primary" onClick={startExam}>{loading ? 'Preparing…' : 'Start practice'} <ArrowRight size={18}/></button><p className="data-note">Answers are recorded for this session. Scoring will be available once answer keys are verified.</p></div>
        : complete ? <div className="exam-setup"><span className="completion-icon"><Check size={30}/></span><h2>Session complete.</h2><p>You answered {questions.filter(q => answers[q.id]).length} of {questions.length} questions.</p><p className="data-note">No score is calculated: this bank does not yet contain verified answers.</p><button className="primary" onClick={() => { setDeadline(null); setComplete(false); }}>Another session <ArrowRight size={18}/></button><details className="answer-review"><summary>Review your selections <ChevronDown size={16}/></summary>{questions.map((q, i) => <div key={q.id}><strong>{i + 1}. {q.stem}</strong><p>{answers[q.id] ? `${answers[q.id]}. ${q.options.find(o => o.label === answers[q.id])?.text}` : 'Not answered'}</p></div>)}</details></div>
        : loading ? <div className="empty" role="status">Loading your question…</div>
        : !question ? <div className="empty"><h2>No matching questions.</h2><p>Try a different word or clear your search.</p></div>
        : <article className="question" key={question.id}><div className="question-heading"><span className="question-tag">QUESTION {mode === 'bank' ? offset + 1 : index + 1}</span></div><h2>{question.stem}</h2><div className="options" role="group" aria-label="Answer options">{question.options.map(option => <button key={option.label} className={`option ${answers[question.id] === option.label ? 'selected' : ''}`} aria-pressed={answers[question.id] === option.label} onClick={() => setAnswers(a => ({ ...a, [question.id]: option.label }))}><span className="option-letter">{option.label}</span><span>{option.text}</span><span className="selection-dot">{answers[question.id] === option.label && <Check size={15}/>}</span></button>)}</div><div className="question-footer"><button className="previous" disabled={mode === 'bank' ? offset === 0 : index === 0} onClick={() => mode === 'bank' ? setOffset(o => o - 1) : setIndex(i => i - 1)}><ArrowLeft size={17}/> Previous</button><button className="primary" disabled={mode === 'bank' && offset + 1 >= total} onClick={() => { if (mode === 'bank') setOffset(o => o + 1); else if (index + 1 === questions.length) setComplete(true); else setIndex(i => i + 1); }}>{activeExam && index + 1 === questions.length ? 'Finish' : 'Next question'} <ArrowRight size={17}/></button></div></article>}
      </section>
    </main><footer><span>pax</span></footer>
  </div>;
}
