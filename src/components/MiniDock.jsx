import React from 'react';
import { Play, Pause, X } from 'lucide-react';
import EpisodeArt from './EpisodeArt';
import { formatClock } from '../lib/format';

/**
 * Persistent now-playing dock, shown whenever an episode is loaded and the
 * full player view isn't. Click the body to reopen the player.
 */
export default function MiniDock({ player, episode, onOpen, onClose }) {
  const { isPlaying, currentMs, durationMs } = player;
  const progress = durationMs > 0 ? Math.min(1, currentMs / durationMs) : 0;

  return (
    <div className="animate-dock-in fixed bottom-4 left-1/2 z-50 w-[min(560px,calc(100vw-1.5rem))] -translate-x-1/2 sm:bottom-6">
      <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-cream-50/12 bg-night-700/95 py-2.5 pr-2.5 pl-3 shadow-[0_24px_64px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        {/* Progress hairline */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-cream-50/8">
          <div
            className="h-full bg-gradient-to-r from-ember-500 to-ember-300 transition-[width] duration-300"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Open player">
          <EpisodeArt
            seed={episode.topic}
            title={episode.title}
            playing={isPlaying}
            className="h-10 w-10 shrink-0 rounded-lg"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.85rem] font-medium text-cream-50">
              {episode.title || episode.topic}
            </span>
            <span className="block font-mono text-[0.62rem] text-cream-500">
              {formatClock(currentMs)} / {formatClock(durationMs)}
            </span>
          </span>
        </button>

        {isPlaying && (
          <span className="eq mr-1 shrink-0 text-ember-400" aria-hidden="true">
            <i /><i /><i /><i />
          </span>
        )}

        <button
          onClick={player.toggle}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cream-50 text-night-900 transition-transform hover:scale-105 active:scale-95"
        >
          {isPlaying ? (
            <Pause size={16} fill="currentColor" strokeWidth={0} />
          ) : (
            <Play size={16} fill="currentColor" strokeWidth={0} className="ml-0.5" />
          )}
        </button>

        <button
          onClick={onClose}
          aria-label="Stop and close player"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-cream-500 transition-colors hover:bg-cream-50/8 hover:text-cream-100"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
