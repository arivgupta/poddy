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
  const [appState, setAppState]         = useState('prompt');
  const [topic, setTopic]               = useState('');
  const [title, setTitle]               = useState('');
  const [jobId, setJobId]               = useState(null);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [sourceNames, setSourceNames]   = useState([]);
  const [chapters, setChapters]         = useState([]);
  const [audioUrl, setAudioUrl]         = useState(null);
  const [sourcesUsed, setSourcesUsed]   = useState([]);
  const [durationMs, setDurationMs]     = useState(0);
  const [depth, setDepth]               = useState('standard');
  const [library, setLibrary]           = useState(loadLibrary);
  const [errorInfo, setErrorInfo]       = useState(null);

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
        if (data.title) setTitle(data.title);

        if (data.status === 'done') {
          stopPolling();
          const chaps = data.chapters || [];
          const used  = data.sources_used || [];
          const dur   = data.duration_ms || 0;
          const genTitle = data.title || topic;

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

          setTitle(genTitle);
          setChapters(chaps);
          setSourcesUsed(used);
          setDurationMs(dur);
          setAudioUrl(blobUrl);
          setAppState('player');
          addToLibrary({ jobId: id, topic: data.topic || topic, title: genTitle, chapters: chaps, sourcesUsed: used, durationMs: dur, savedAt: Date.now() });

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
    setTitle(entry.title || entry.topic);
    setJobId(entry.jobId);
    setChapters(entry.chapters || []);
    setSourcesUsed(entry.sourcesUsed || []);
    setDurationMs(entry.durationMs || 0);
    setErrorInfo(null);

    try {
      const blob = await loadAudioBlob(entry.jobId);
      if (blob) {
        setAudioUrl(URL.createObjectURL(blob));
        setAppState('player');
        return;
      }
    } catch {}

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
    setTopic(''); setTitle(''); setJobId(null); setChapters([]); setSourcesUsed([]); setAudioUrl(null); setDurationMs(0);
    setErrorInfo(null);
  }, [stopPolling, audioUrl]);

  const handleDismissError = useCallback(() => setErrorInfo(null), []);

  return (
    <div className="min-h-screen px-6 pb-12 flex flex-col items-center relative z-1">

      {/* Header */}
      <header className="w-full max-w-[860px] flex justify-between items-center py-5 mb-6 border-b border-ink-900/6">
        <div onClick={handleReset} className="flex items-center gap-2.5 cursor-pointer group">
          <div className="w-[34px] h-[34px] rounded-full bg-terra flex items-center justify-center shadow-[0_2px_8px_rgba(191,86,48,0.25)]">
            <span className="text-cream-50 font-semibold text-[0.95rem] font-display">P</span>
          </div>
          <span className="font-display font-semibold text-[1.4rem] text-ink-900 group-hover:text-terra transition-colors">Poddy</span>
        </div>

        <nav className="flex gap-1.5">
          <button
            onClick={() => { stopPolling(); setAppState('library'); }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              appState === 'library'
                ? 'bg-cream-200 text-ink-900 border border-ink-900/10'
                : 'text-ink-500 hover:text-ink-900 border border-transparent'
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
      {errorInfo && appState === 'prompt' && (
        <div className="animate-entrance w-full max-w-[640px] mb-6 p-5 rounded-2xl bg-error/7 border border-error/18">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-error text-[0.95rem] font-semibold">{errorInfo.title}</h3>
            <button onClick={handleDismissError} className="text-ink-400 hover:text-ink-900 text-xl leading-none transition-colors">&times;</button>
          </div>
          <p className="text-ink-500 text-sm leading-relaxed">{errorInfo.detail}</p>
          {errorInfo.canRetry && (
            <button
              onClick={handleDismissError}
              className="mt-3 px-4 py-1.5 rounded-full bg-error/7 border border-error/18 text-error font-semibold text-sm hover:bg-error/12 transition-colors"
            >
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
        {appState === 'player'  && (
          <SynthPlayer topic={topic} title={title} jobId={jobId} audioUrl={audioUrl} chapters={chapters} sourcesUsed={sourcesUsed} durationMs={durationMs} onBack={handleReset} />
        )}
        {appState === 'library' && (
          <Library entries={library} onPlay={handlePlayLibraryEntry} onDelete={deleteFromLibrary} onNewCast={() => setAppState('prompt')} />
        )}
      </main>

      <footer className="mt-16 text-ink-400 text-xs tracking-wide font-body">
        Poddy — assembling knowledge from the world's best conversations
      </footer>
    </div>
  );
}

export default App;
