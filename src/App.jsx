import React, { useState, useRef, useCallback, useEffect } from 'react';
import PromptInterface from './components/PromptInterface';
import CuratorLoadingState from './components/CuratorLoadingState';
import SynthPlayer from './components/SynthPlayer';
import Library from './components/Library';
import MiniPlayer from './components/MiniPlayer';
import { saveAudioBlob, loadAudioBlob, deleteAudioBlob } from './lib/audioStore';
import { clearProgress } from './lib/playbackProgress';
import { PlayerProvider } from './lib/PlayerProvider';
import { usePlayer } from './lib/playerContext';

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';
const LIBRARY_KEY = 'poddy_library';

function loadLibrary() {
  try { return JSON.parse(localStorage.getItem(LIBRARY_KEY) || '[]'); }
  catch { return []; }
}
function saveLibraryToStorage(entries) {
  try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries)); }
  catch { /* storage full or unavailable */ }
}

// Newest-first ordering, matching how the Library lists casts.
function orderedQueue(entries) {
  return [...entries].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}

// Turn a library entry into a playable URL: prefer the locally cached blob,
// fall back to streaming from the server. Returns null if neither is available.
async function resolveAudioUrl(entry) {
  try {
    const blob = await loadAudioBlob(entry.jobId);
    if (blob) return URL.createObjectURL(blob);
  } catch { /* fall through */ }
  const serverUrl = `${BACKEND}/audio/${entry.jobId}`;
  try {
    const res = await fetch(serverUrl, { method: 'HEAD' });
    if (res.ok) return serverUrl;
  } catch { /* server unreachable */ }
  return null;
}

function AppShell() {
  const player = usePlayer();
  const [appState, setAppState]           = useState('prompt');
  const [topic, setTopic]                 = useState('');
  const [title, setTitle]                 = useState('');
  const [loadingStatus, setLoadingStatus] = useState('');
  const [sourceNames, setSourceNames]     = useState([]);
  const [depth, setDepth]                 = useState('standard');
  const [library, setLibrary]             = useState(loadLibrary);
  const [errorInfo, setErrorInfo]         = useState(null);

  const pollRef = useRef(null);
  const cancelledRef = useRef(false);
  const lineageRef = useRef(null);
  const libraryRef = useRef(library);
  useEffect(() => { libraryRef.current = library; }, [library]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

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
    clearProgress(id);
    try { await deleteAudioBlob(id); } catch { /* blob may not exist */ }
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
        if (data.title) setTitle(data.title);

        if (data.status === 'done') {
          stopPolling();
          const chapters = data.chapters || [];
          const sourcesUsed = data.sources_used || [];
          const durationMs = data.duration_ms || 0;
          const genTitle = data.title || topic;

          try {
            const audioRes = await fetch(`${BACKEND}/audio/${id}`);
            if (audioRes.ok) {
              const blob = await audioRes.blob();
              await saveAudioBlob(id, blob);
            }
          } catch (e) { console.error('Failed to cache audio locally:', e); }

          const entry = { jobId: id, topic: data.topic || topic, title: genTitle, chapters, sourcesUsed, durationMs, savedAt: Date.now(), ...(lineageRef.current || {}) };
          addToLibrary(entry);

          const queue = [entry, ...orderedQueue(libraryRef.current.filter(e => e.jobId !== id))];
          const ok = await player.play(entry, queue);
          if (ok) {
            setAppState('player');
          } else {
            setErrorInfo({ title: 'Audio unavailable', detail: 'The podcast was created but its audio could not be loaded. Please try again.', canRetry: true });
            setAppState('prompt');
          }
        } else if (data.status === 'error') {
          stopPolling();
          setErrorInfo({ title: 'Generation failed', detail: data.error || 'An unexpected error occurred while creating your podcast.', canRetry: true });
          setAppState('prompt');
        }
      } catch (e) { console.error('Poll error:', e); }
    }, 2000);
  }, [topic, addToLibrary, stopPolling, player]);

  const handleSynthesize = async (query, selectedDepth, lineage = null) => {
    lineageRef.current = lineage;
    setTopic(query);
    setTitle('');
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
      pollJob(job_id);
    } catch (e) {
      console.error(e);
      setErrorInfo({ title: 'Connection failed', detail: 'Could not reach the Poddy server. Please check your connection and try again.', canRetry: true });
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
    setErrorInfo(null);
    const queue = orderedQueue(libraryRef.current);
    const ok = await player.play(entry, queue);
    if (ok) {
      setAppState('player');
    } else {
      setErrorInfo({
        title: 'Audio unavailable',
        detail: "This podcast's audio is no longer available. The server may have restarted since it was created. You can generate it again with the same topic.",
        canRetry: false,
      });
      setAppState('library');
    }
  }, [player]);

  const handleNavHome = useCallback(() => { stopPolling(); setAppState('prompt'); }, [stopPolling]);
  const handleDismissError = useCallback(() => setErrorInfo(null), []);

  const showMini = player.track && appState !== 'player';
  const onCloseMini = useCallback(() => player.stop(), [player]);

  return (
    <div className={`min-h-screen px-6 flex flex-col items-center relative z-1 ${showMini ? 'pb-32' : 'pb-12'}`}>

      {/* Header */}
      <header className="w-full max-w-[860px] flex justify-between items-center py-5 mb-6 border-b border-ink-900/6">
        <div onClick={handleNavHome} className="flex items-center gap-2.5 cursor-pointer group">
          <div className="w-[34px] h-[34px] rounded-full bg-terra flex items-center justify-center shadow-[0_2px_8px_rgba(191,86,48,0.25)]">
            <span className="text-cream-50 font-semibold text-[0.95rem] font-display">P</span>
          </div>
          <span className="font-display font-semibold text-[1.4rem] text-ink-900 group-hover:text-terra transition-colors">Poddy</span>
        </div>

        <nav className="flex gap-1.5">
          <button
            onClick={() => { stopPolling(); setAppState('library'); }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              appState === 'library' ? 'bg-cream-200 text-ink-900 border border-ink-900/10' : 'text-ink-500 hover:text-ink-900 border border-transparent'
            }`}
          >
            Library
          </button>
          <button
            onClick={() => { stopPolling(); setAppState('prompt'); }}
            className="px-4 py-2 rounded-full text-sm font-semibold bg-terra text-white hover:bg-terra-light transition-colors shadow-[0_2px_8px_rgba(191,86,48,0.20)]"
          >
            New Cast
          </button>
        </nav>
      </header>

      {/* Error banner */}
      {errorInfo && appState !== 'loading' && appState !== 'player' && (
        <div className="animate-entrance w-full max-w-[640px] mb-6 p-5 rounded-2xl bg-error/7 border border-error/18">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-error text-[0.95rem] font-semibold">{errorInfo.title}</h3>
            <button onClick={handleDismissError} className="text-ink-400 hover:text-ink-900 text-xl leading-none transition-colors">&times;</button>
          </div>
          <p className="text-ink-500 text-sm leading-relaxed">{errorInfo.detail}</p>
          {errorInfo.canRetry && (
            <button onClick={handleDismissError} className="mt-3 px-4 py-1.5 rounded-full bg-error/7 border border-error/18 text-error font-semibold text-sm hover:bg-error/12 transition-colors">
              Try again
            </button>
          )}
        </div>
      )}

      {/* Main content */}
      <main className="w-full max-w-[860px] flex-1 flex flex-col items-center">
        {appState === 'prompt'  && <PromptInterface onSynthesize={handleSynthesize} />}
        {appState === 'loading' && (
          <CuratorLoadingState topic={topic} title={title} status={loadingStatus} sourceNames={sourceNames} onCancel={handleCancel} depth={depth} />
        )}
        {appState === 'player'  && <SynthPlayer onBack={handleNavHome} onGenerate={handleSynthesize} />}
        {appState === 'library' && (
          <Library entries={library} onPlay={handlePlayLibraryEntry} onDelete={deleteFromLibrary} onNewCast={() => setAppState('prompt')} />
        )}
      </main>

      <footer className="mt-16 text-ink-400 text-xs tracking-wide font-body">
        Poddy — assembling knowledge from the world's best conversations
      </footer>

      {showMini && <MiniPlayer onExpand={() => setAppState('player')} onClose={onCloseMini} />}
    </div>
  );
}

export default function App() {
  return (
    <PlayerProvider resolveAudioUrl={resolveAudioUrl}>
      <AppShell />
    </PlayerProvider>
  );
}
