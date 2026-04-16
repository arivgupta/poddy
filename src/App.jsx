import React, { useState, useRef, useCallback, useEffect } from 'react';
import PromptInterface from './components/PromptInterface';
import CuratorLoadingState from './components/CuratorLoadingState';
import SynthPlayer from './components/SynthPlayer';
import Library from './components/Library';
import { saveAudioBlob, loadAudioBlob, deleteAudioBlob } from './lib/audioStore';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';
const LIBRARY_KEY = 'poddy_library';

function loadLibrary() {
  try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]'); }
  catch { return []; }
}
function saveLibraryToStorage(entries) {
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
  const [depth, setDepth]               = useState('standard');
  const [library, setLibrary]           = useState(loadLibrary);
  const [errorInfo, setErrorInfo]       = useState(null); // { title, detail, canRetry }

  const pollRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const addToLibrary = useCallback((entry) => {
    setLibrary(prev => {
      const updated = [...prev.filter(e => e.jobId !== entry.jobId), entry];
      saveLibraryToStorage(updated);
      return updated;
    });
  }, []);

  const deleteFromLibrary = useCallback(async (id) => {
    setLibrary(prev => {
      const updated = prev.filter(e => e.jobId !== id);
      saveLibraryToStorage(updated);
      return updated;
    });
    try { await deleteAudioBlob(id); } catch {}
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const pollJob = useCallback((id) => {
    cancelledRef.current = false;
    pollRef.current = setInterval(async () => {
      if (cancelledRef.current) { stopPolling(); return; }
      try {
        const res  = await fetch(`${BACKEND}/jobs/${id}`);
        const data = await res.json();

        if (cancelledRef.current) { stopPolling(); return; }

        setLoadingStatus(data.status);
        if (data.source_names) setSourceNames(data.source_names);

        if (data.status === 'done') {
          stopPolling();
          const chaps = data.chapters || [];
          const used  = data.sources_used || [];
          const dur   = data.duration_ms || 0;

          // Download the audio blob and persist it locally
          let blobUrl = null;
          try {
            const audioRes = await fetch(`${BACKEND}/audio/${id}`);
            if (!audioRes.ok) throw new Error('Audio fetch failed');
            const blob = await audioRes.blob();
            await saveAudioBlob(id, blob);
            blobUrl = URL.createObjectURL(blob);
          } catch (e) {
            console.error('Failed to cache audio locally:', e);
            blobUrl = `${BACKEND}/audio/${id}`;
          }

          setChapters(chaps);
          setSourcesUsed(used);
          setDurationMs(dur);
          setAudioUrl(blobUrl);
          setAppState('player');
          addToLibrary({ jobId: id, topic: data.topic || topic, chapters: chaps, sourcesUsed: used, durationMs: dur, savedAt: Date.now() });

        } else if (data.status === 'error') {
          stopPolling();
          setErrorInfo({
            title: 'Generation failed',
            detail: data.error || 'An unexpected error occurred while creating your podcast.',
            canRetry: true,
          });
          setAppState('prompt');
        }
      } catch (e) { console.error('Poll error:', e); }
    }, 2000);
  }, [topic, addToLibrary, stopPolling]);

  const handleSynthesize = async (query, selectedDepth) => {
    setTopic(query);
    setDepth(selectedDepth);
    setAppState('loading');
    setLoadingStatus('queued');
    setSourceNames([]);
    setErrorInfo(null);
    cancelledRef.current = false;
    try {
      const res = await fetch(`${BACKEND}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: query, depth: selectedDepth }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { job_id } = await res.json();
      setJobId(job_id);
      pollJob(job_id);
    } catch (e) {
      console.error(e);
      setErrorInfo({
        title: 'Connection failed',
        detail: 'Could not reach the Poddy server. Please check your connection and try again.',
        canRetry: true,
      });
      setAppState('prompt');
    }
  };

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
    stopPolling();
    setAppState('prompt');
    setLoadingStatus('');
    setSourceNames([]);
  }, [stopPolling]);

  const handlePlayLibraryEntry = useCallback(async (entry) => {
    stopPolling();
    setTopic(entry.topic);
    setJobId(entry.jobId);
    setChapters(entry.chapters || []);
    setSourcesUsed(entry.sourcesUsed || []);
    setDurationMs(entry.durationMs || 0);
    setErrorInfo(null);

    // Try loading from IndexedDB first, fall back to server
    try {
      const blob = await loadAudioBlob(entry.jobId);
      if (blob) {
        setAudioUrl(URL.createObjectURL(blob));
        setAppState('player');
        return;
      }
    } catch {}

    // Fallback: try server (may work if server hasn't restarted)
    const serverUrl = `${BACKEND}/audio/${entry.jobId}`;
    try {
      const res = await fetch(serverUrl, { method: 'HEAD' });
      if (res.ok) {
        setAudioUrl(serverUrl);
        setAppState('player');
        return;
      }
    } catch {}

    setErrorInfo({
      title: 'Audio unavailable',
      detail: 'This podcast\'s audio is no longer available. The server may have restarted since it was created. You can generate it again with the same topic.',
      canRetry: false,
    });
    setAppState('prompt');
  }, [stopPolling]);

  const handleReset = useCallback(() => {
    stopPolling();
    if (audioUrl && audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
    setAppState('prompt');
    setTopic(''); setJobId(null); setChapters([]); setSourcesUsed([]); setAudioUrl(null); setDurationMs(0);
    setErrorInfo(null);
  }, [stopPolling, audioUrl]);

  const handleDismissError = useCallback(() => setErrorInfo(null), []);

  return (
    <div style={{ minHeight: '100vh', padding: '0 1.5rem 3rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header style={{ width: '100%', maxWidth: '860px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 0', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
        <div
          onClick={handleReset}
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
        >
          <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'linear-gradient(135deg, var(--amber), var(--coral))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(245,166,35,0.35)' }}>
            <span style={{ color: 'black', fontWeight: 900, fontSize: '1rem', fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>P</span>
          </div>
          <span className="display" style={{ fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Poddy</span>
        </div>

        <nav style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { label: 'Library', state: 'library' },
            { label: 'New Cast', state: 'prompt', primary: true },
          ].map(({ label, state: s, primary }) => (
            <button
              key={s}
              onClick={() => { stopPolling(); setAppState(s); }}
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

      {/* ── Error banner ─────────────────────────────────────────────────────── */}
      {errorInfo && appState === 'prompt' && (
        <div style={{
          width: '100%', maxWidth: '640px', marginBottom: '1.5rem',
          padding: '1.25rem 1.5rem', borderRadius: '16px',
          background: 'var(--coral-glow)', border: '1px solid rgba(255,75,54,0.3)',
          animation: 'fadeSlideUp 0.3s ease',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
            <h3 style={{ color: 'var(--coral)', fontSize: '0.95rem', fontWeight: 600 }}>{errorInfo.title}</h3>
            <button
              onClick={handleDismissError}
              style={{ background: 'transparent', color: 'var(--text-tertiary)', fontSize: '1.2rem', lineHeight: 1, cursor: 'pointer', padding: '0 0.25rem' }}
            >&times;</button>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.5 }}>{errorInfo.detail}</p>
          {errorInfo.canRetry && (
            <button
              onClick={handleDismissError}
              style={{
                marginTop: '0.85rem', padding: '0.5rem 1.2rem', borderRadius: '50px',
                background: 'rgba(255,75,54,0.15)', border: '1px solid rgba(255,75,54,0.3)',
                color: 'var(--coral)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
                fontFamily: 'var(--font-body)', transition: 'all 0.2s',
              }}
              onMouseOver={e => e.currentTarget.style.background = 'rgba(255,75,54,0.25)'}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(255,75,54,0.15)'}
            >
              Try again
            </button>
          )}
        </div>
      )}

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main style={{ width: '100%', maxWidth: '860px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {appState === 'prompt'  && <PromptInterface onSynthesize={handleSynthesize} />}
        {appState === 'loading' && (
          <CuratorLoadingState
            topic={topic}
            status={loadingStatus}
            sourceNames={sourceNames}
            onCancel={handleCancel}
            depth={depth}
          />
        )}
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
