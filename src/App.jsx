import React, { useCallback, useEffect, useState } from 'react';
import Header from './components/Header';
import Toasts from './components/Toasts';
import MiniDock from './components/MiniDock';
import Home from './views/Home';
import Studio from './views/Studio';
import Player from './views/Player';
import Library from './views/Library';
import { useToasts } from './hooks/useToasts';
import { useLibrary } from './hooks/useLibrary';
import { usePlayer } from './hooks/usePlayer';
import { useGeneration } from './hooks/useGeneration';
import { loadAudioBlob } from './lib/audioStore';
import { audioExistsOnServer, streamUrl } from './lib/api';
import { STAGES, stageIndex } from './lib/stages';
import { formatClock } from './lib/format';

export default function App() {
  const [view, setView] = useState('home');
  const [prefillTopic, setPrefillTopic] = useState('');
  const [focusSignal, setFocusSignal] = useState(0);

  const { toasts, push, dismiss } = useToasts();
  const library = useLibrary();
  const player = usePlayer();

  // ── Generation lifecycle ──────────────────────────────────────────────
  // useGeneration re-reads these callbacks on every render, so closing over
  // `view` and `player` directly always sees current values.
  const generationApi = useGeneration({
    onComplete: (entry, blobUrl) => {
      library.upsert(entry);
      const inStudio = view === 'studio';
      const somethingElsePlaying = player.episode && player.isPlaying;

      if (inStudio && !somethingElsePlaying) {
        player.load(entry, blobUrl, { autoplay: false });
        setView('player');
        push({ kind: 'success', message: 'Your episode is ready. Press play.' });
      } else {
        push({
          kind: 'success',
          message: `"${entry.title}" is ready.`,
          duration: 12000,
          action: {
            label: 'Listen now',
            onClick: () => {
              player.load(entry, blobUrl, { autoplay: true });
              setView('player');
            },
          },
        });
      }
    },
    onFailed: (gen, message) => {
      if (view !== 'studio') {
        push({
          kind: 'error',
          message: `Production failed: ${message}`,
          duration: 10000,
          action: { label: 'See details', onClick: () => setView('studio') },
        });
      }
    },
    onResume: () => {
      setView('studio');
      push({ kind: 'info', message: 'Welcome back — your episode is still in production.' });
    },
  });
  const { generation, isActive, start, cancel, dismissError } = generationApi;

  // ── Actions ───────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    async (topic, depth) => {
      setPrefillTopic('');
      setView('studio');
      try {
        await start(topic, depth);
      } catch (err) {
        setView('home');
        push({ kind: 'error', message: err.message, duration: 8000 });
      }
    },
    [start, push],
  );

  const handleBlockedSubmit = useCallback(() => {
    push({
      kind: 'info',
      message: 'One episode at a time — yours is still in the studio.',
      action: { label: 'View progress', onClick: () => setView('studio') },
    });
  }, [push]);

  const handlePlayEntry = useCallback(
    async (entry) => {
      // Prefer the locally cached copy; fall back to streaming.
      let src = null;
      try {
        const blob = await loadAudioBlob(entry.jobId);
        if (blob) src = URL.createObjectURL(blob);
      } catch {
        /* cache unavailable */
      }
      if (!src && (await audioExistsOnServer(entry.jobId))) {
        src = streamUrl(entry.jobId);
      }
      if (!src) {
        push({
          kind: 'error',
          message:
            'This episode\'s audio is gone — the studio has moved on. Craft it again with the same prompt.',
          duration: 9000,
          action: {
            label: 'Re-craft it',
            onClick: () => {
              setPrefillTopic(entry.topic);
              setView('home');
              setFocusSignal((n) => n + 1);
            },
          },
        });
        return;
      }

      const resumedMs = player.load(entry, src, { autoplay: true });
      setView('player');
      if (resumedMs > 0) {
        push({ kind: 'info', message: `Picked up where you left off — ${formatClock(resumedMs)}.` });
      }
    },
    [player, push],
  );

  const handleNavigate = useCallback(
    (target, opts = {}) => {
      if (generation?.status === 'error' && target !== 'studio') dismissError();
      setView(target);
      if (opts.focusComposer) {
        setPrefillTopic('');
        setFocusSignal((n) => n + 1);
        requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      }
    },
    [generation, dismissError],
  );

  const handleCancelGeneration = useCallback(() => {
    cancel();
    setView('home');
    push({ kind: 'info', message: 'Production cancelled.' });
  }, [cancel, push]);

  const handleRetry = useCallback(() => {
    if (!generation) return;
    const { topic, depth } = generation;
    dismissError();
    handleSubmit(topic, depth);
  }, [generation, dismissError, handleSubmit]);

  const handleEditPrompt = useCallback(() => {
    if (generation) setPrefillTopic(generation.topic);
    dismissError();
    setView('home');
    setFocusSignal((n) => n + 1);
  }, [generation, dismissError]);

  const handleCloseDock = useCallback(() => {
    player.stop();
  }, [player]);

  // ── Global keyboard shortcuts (only while an episode is loaded) ───────
  const hasEpisode = Boolean(player.episode);
  const { toggle: playerToggle, skip: playerSkip } = player;
  useEffect(() => {
    if (!hasEpisode) return;
    const onKey = (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const tag = t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) return;
      const isSlider = t.getAttribute('role') === 'slider';

      if (e.code === 'Space') {
        // Focused buttons/links keep their native space behavior.
        if (tag === 'BUTTON' || tag === 'A' || isSlider) return;
        e.preventDefault();
        playerToggle();
      } else if (e.key === 'ArrowLeft' && !isSlider) {
        playerSkip(-15);
      } else if (e.key === 'ArrowRight' && !isSlider) {
        playerSkip(15);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasEpisode, playerToggle, playerSkip]);

  // ── Document title ────────────────────────────────────────────────────
  useEffect(() => {
    if (player.isPlaying && player.episode) {
      document.title = `▶ ${player.episode.title || player.episode.topic} — Poddy`;
    } else if (isActive) {
      document.title = 'In the studio… — Poddy';
    } else {
      document.title = 'Poddy — Any question. One perfect episode.';
    }
  }, [player.isPlaying, player.episode, isActive]);

  const generationLabel = (() => {
    if (!generation) return '';
    const idx = stageIndex(generation.status);
    return idx >= 0 ? STAGES[idx].label : 'Producing…';
  })();

  const showStudio = view === 'studio' && generation;
  const showPlayer = view === 'player' && player.episode;
  const showDock = player.episode && view !== 'player';

  return (
    <div className="relative flex min-h-screen flex-col">
      <Header
        view={view}
        onNavigate={handleNavigate}
        isGenerating={isActive}
        generationLabel={generationLabel}
        libraryCount={library.entries.length}
      />

      <main className={`flex-1 ${showDock ? 'pb-24' : ''}`}>
        {view === 'home' && (
          <Home
            onSubmit={handleSubmit}
            composerDisabled={isActive}
            onBlockedSubmit={handleBlockedSubmit}
            prefillTopic={prefillTopic}
            focusSignal={focusSignal}
            recentEntries={library.entries}
            playingJobId={player.episode?.jobId || null}
            onPlayEntry={handlePlayEntry}
            onOpenLibrary={() => setView('library')}
          />
        )}

        {showStudio && (
          <Studio
            generation={generation}
            onCancel={handleCancelGeneration}
            onRetry={handleRetry}
            onEditPrompt={handleEditPrompt}
            onBrowseLibrary={() => setView('library')}
            hasLibrary={library.entries.length > 0}
          />
        )}
        {view === 'studio' && !generation && (
          <div className="animate-entrance mx-auto max-w-[420px] px-5 pt-24 pb-24 text-center">
            <p className="mb-6 text-[0.95rem] text-cream-400">The studio is quiet — nothing in production.</p>
            <button
              onClick={() => handleNavigate('home', { focusComposer: true })}
              className="rounded-2xl bg-gradient-to-r from-ember-500 to-ember-400 px-6 py-3 text-[0.92rem] font-semibold text-night-950 shadow-[0_8px_28px_rgba(233,104,58,0.35)]"
            >
              Start a new episode
            </button>
          </div>
        )}

        {showPlayer && (
          <Player
            player={player}
            episode={player.episode}
            onBack={() => setView(isActive ? 'studio' : 'home')}
          />
        )}
        {view === 'player' && !player.episode && (
          <div className="animate-entrance mx-auto max-w-[420px] px-5 pt-24 pb-24 text-center">
            <p className="mb-6 text-[0.95rem] text-cream-400">Nothing loaded. Pick an episode from your library.</p>
            <button
              onClick={() => setView('library')}
              className="rounded-2xl border border-cream-50/15 px-6 py-3 text-[0.92rem] font-medium text-cream-200 hover:border-cream-50/30"
            >
              Open library
            </button>
          </div>
        )}

        {view === 'library' && (
          <Library
            entries={library.entries}
            playingJobId={player.episode?.jobId || null}
            isPlaying={player.isPlaying}
            onPlay={handlePlayEntry}
            onDelete={library.remove}
            onNewEpisode={() => handleNavigate('home', { focusComposer: true })}
          />
        )}
      </main>

      {view === 'home' && (
        <footer className={`border-t border-cream-50/6 pt-8 text-center ${showDock ? 'pb-28' : 'pb-8'}`}>
          <p className="font-mono text-[0.65rem] tracking-[0.2em] text-cream-600 uppercase">
            Poddy — assembled from the world's best conversations
          </p>
        </footer>
      )}

      {showDock && (
        <MiniDock
          player={player}
          episode={player.episode}
          onOpen={() => setView('player')}
          onClose={handleCloseDock}
        />
      )}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
