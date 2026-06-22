import React from 'react';
import { Play, Pause, Rewind, FastForward, ChevronUp, X } from 'lucide-react';
import TopicArtwork from './TopicArtwork';
import { usePlayer } from '../lib/playerContext';
import { SKIP_SECONDS } from '../lib/playerConstants';

function fmt(ms) {
  if (!ms || isNaN(ms)) return '0:00';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MiniPlayer({ onExpand, onClose }) {
  const { track, isPlaying, currentMs, totalMs, togglePlay, skip } = usePlayer();
  if (!track) return null;

  const topic = track.topic || '';
  const title = track.title || topic;
  const dur = totalMs || track.durationMs || 0;
  const progress = dur > 0 ? (currentMs / dur) * 100 : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[9000] px-3 pb-3 pointer-events-none">
      <div className="animate-entrance pointer-events-auto mx-auto w-full max-w-[820px] rounded-2xl bg-warm-dark/97 backdrop-blur-md border border-white/8 shadow-[0_-4px_30px_rgba(30,24,20,0.30)] overflow-hidden">
        {/* progress line */}
        <div className="h-1 bg-white/10">
          <div className="h-full bg-terra transition-[width] duration-200 linear" style={{ width: `${progress}%` }} />
        </div>

        <div className="flex items-center gap-3 px-3 py-2.5">
          <button onClick={onExpand} className="flex items-center gap-3 min-w-0 flex-1 text-left group" title="Open full player">
            <TopicArtwork topic={topic} title={title} size={44} isPlaying={isPlaying} />
            <div className="min-w-0">
              <div className="text-cream-50 text-sm font-medium truncate group-hover:text-terra-light transition-colors">{title}</div>
              <div className="text-cream-400/60 text-[0.7rem] tabular-nums">{fmt(currentMs)} / {fmt(dur)}</div>
            </div>
          </button>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button onClick={() => skip(-SKIP_SECONDS)} title={`Back ${SKIP_SECONDS}s`} className="hidden sm:flex text-cream-400/80 hover:text-cream-50 transition-colors p-1.5"><Rewind size={18} /></button>
            <button onClick={togglePlay} title="Play / pause" className="w-10 h-10 rounded-full bg-terra text-cream-50 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform">
              {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
            </button>
            <button onClick={() => skip(SKIP_SECONDS)} title={`Forward ${SKIP_SECONDS}s`} className="hidden sm:flex text-cream-400/80 hover:text-cream-50 transition-colors p-1.5"><FastForward size={18} /></button>
            <button onClick={onExpand} title="Open full player" className="text-cream-400/80 hover:text-cream-50 transition-colors p-1.5"><ChevronUp size={18} /></button>
            <button onClick={onClose} title="Close player" className="text-cream-400/60 hover:text-cream-50 transition-colors p-1.5"><X size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
