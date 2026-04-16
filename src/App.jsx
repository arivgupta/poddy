import React, { useState, useRef, useCallback, useEffect } from 'react';
import PromptInterface from './components/PromptInterface';
import CuratorLoadingState from './components/CuratorLoadingState';
import SynthPlayer from './components/SynthPlayer';
import Library from './components/Library';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';
const LIBRARY_KEY = 'poddy_library';

function loadLibrary() {
  try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]'); }
  catch { return []; }
}
function saveLibrary(entries) {
  try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries)); }
  catch {}
}

function App() {
  const [appState, setAppState]         = useState('prompt'); // prompt | loading | player | library
  const [topic, setTopic]               = useState('');
  const [jobId, setJobId]               = useState(null);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [sourceNames, setSourceNames]   = useState([]);
  const [chapters, setChapters]         = useState([]);
  const [audioUrl, setAudioUrl]         = useState(null);
  const [sourcesUsed, setSourcesUsed]   = useState([]);
  const [durationMs, setDurationMs]     = useState(0);
  const [library, setLibrary]           = useState(loadLibrary);

  const pollRef = useRef(null);

  const addToLibrary = useCallback((entry) => {
    setLibrary(prev => {
      const updated = [...prev.filter(e => e.jobId !== entry.jobId), entry];
      saveLibrary(updated);
      return updated;
    });
  }, []);

  const deleteFromLibrary = useCallback((id) => {
    setLibrary(prev => {
      const updated = prev.filter(e => e.jobId !== id);
      saveLibrary(updated);
      return updated;
    });
  }, []);

  const pollJob = useCallback((id) => {
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${BACKEND}/jobs/${id}`);
        const data = await res.json();
        setLoadingStatus(data.status);
        if (data.source_names) setSourceNames(data.source_names);

        if (data.status === 'done') {
          clearInterval(pollRef.current);
          const chaps      = data.chapters || [];
          const used       = data.sources_used || [];
          const dur        = data.duration_ms || 0;
          const url        = `${BACKEND}/audio/${id}`;
          setChapters(chaps);
          setSourcesUsed(used);
          setDurationMs(dur);
          setAudioUrl(url);
          setAppState('player');
          // Persist to library
          addToLibrary({ jobId: id, topic: data.topic || topic, chapters: chaps, sourcesUsed: used, durationMs: dur, savedAt: Date.now() });
        } else if (data.status === 'error') {
          clearInterval(pollRef.current);
          alert(`Generation failed: ${data.error}`);
          setAppState('prompt');
        }
      } catch (e) { console.error('Poll error:', e); }
    }, 2000);
  }, [topic, addToLibrary]);

  const handleSynthesize = async (query, depth) => {
    setTopic(query);
    setAppState('loading');
    setLoadingStatus('queued');
    setSourceNames([]);
    try {
      const res = await fetch(`${BACKEND}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: query, depth }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { job_id } = await res.json();
      setJobId(job_id);
      pollJob(job_id);
    } catch (e) {
      console.error(e);
      alert('Could not reach backend — is it running on :8000?');
      setAppState('prompt');
    }
  };

  const handlePlayLibraryEntry = (entry) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setTopic(entry.topic);
    setJobId(entry.jobId);
    setChapters(entry.chapters || []);
    setSourcesUsed(entry.sourcesUsed || []);
    setDurationMs(entry.durationMs || 0);
    setAudioUrl(`${BACKEND}/audio/${entry.jobId}`);
    setAppState('player');
  };

  const handleReset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setAppState('prompt');
    setTopic(''); setJobId(null); setChapters([]); setSourcesUsed([]); setAudioUrl(null); setDurationMs(0);
  };

  return (
    <div style={{ minHeight: '100vh', padding: '0 1.5rem 3rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header style={{ width: '100%', maxWidth: '860px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 0', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
        {/* Logo */}
        <div
          onClick={handleReset}
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
        >
          <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, var(--amber), var(--coral))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(245,166,35,0.35)' }}>
            <span style={{ color: 'black', fontWeight: 900, fontSize: '1rem', fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>S</span>
          </div>
          <span className="display" style={{ fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Poddy</span>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { label: 'Library', state: 'library' },
            { label: 'New Cast', state: 'prompt', primary: true },
          ].map(({ label, state: s, primary }) => (
            <button
              key={s}
              onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setAppState(s); }}
              style={{
                padding: '0.5rem 1.15rem', borderRadius: '50px',
                background: primary ? 'var(--amber)' : (appState === s ? 'var(--bg-tertiary)' : 'transparent'),
                color: primary ? 'black' : (appState === s ? 'var(--text-primary)' : 'var(--text-secondary)'),
                fontWeight: primary ? 700 : 500,
                fontSize: '0.88rem',
                border: primary ? 'none' : `1px solid ${appState === s ? 'var(--border-medium)' : 'transparent'}`,
                transition: 'all 0.2s',
                fontFamily: 'var(--font-body)',
              }}
              onMouseOver={e => { if (!primary && appState !== s) e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseOut={e => { if (!primary && appState !== s) e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main style={{ width: '100%', maxWidth: '860px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {appState === 'prompt'  && <PromptInterface onSynthesize={handleSynthesize} />}
        {appState === 'loading' && <CuratorLoadingState topic={topic} status={loadingStatus} sourceNames={sourceNames} />}
        {appState === 'player'  && (
          <SynthPlayer
            topic={topic}
            jobId={jobId}
            audioUrl={audioUrl}
            chapters={chapters}
            sourcesUsed={sourcesUsed}
            durationMs={durationMs}
            onBack={handleReset}
          />
        )}
        {appState === 'library' && (
          <Library
            entries={library}
            onPlay={handlePlayLibraryEntry}
            onDelete={deleteFromLibrary}
            onNewCast={() => setAppState('prompt')}
          />
        )}
      </main>

      <footer style={{ marginTop: '4rem', color: 'var(--text-muted)', fontSize: '0.78rem', letterSpacing: '0.04em' }}>
        Poddy — assembling knowledge from the world's best conversations
      </footer>
    </div>
  );
}

export default App;
