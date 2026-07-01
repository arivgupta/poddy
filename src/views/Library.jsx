import React, { useMemo, useState } from 'react';
import { Search, Play, Trash2, Plus, Clock, Layers, Disc3 } from 'lucide-react';
import EpisodeArt from '../components/EpisodeArt';
import { formatDuration, formatSavedAt } from '../lib/format';

function EmptyState({ onNewEpisode }) {
  return (
    <div className="animate-entrance mx-auto flex max-w-[420px] flex-col items-center px-5 pt-20 pb-24 text-center">
      <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-full border border-cream-50/8 bg-cream-50/[0.03]">
        <Disc3 size={38} className="text-cream-500" strokeWidth={1.4} />
      </div>
      <h2 className="mb-3 font-display text-[1.8rem] font-semibold text-cream-50">No episodes yet</h2>
      <p className="mb-9 text-[0.92rem] leading-relaxed text-cream-400">
        Everything you craft is saved here — cached on this device so you can
        re-listen anytime, even after the studio moves on.
      </p>
      <button
        onClick={onNewEpisode}
        className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-ember-500 to-ember-400 px-6 py-3.5 text-[0.95rem] font-semibold text-night-950 shadow-[0_8px_28px_rgba(233,104,58,0.35)] transition-all hover:brightness-105 active:scale-[0.98]"
      >
        <Plus size={17} strokeWidth={2.5} /> Craft your first episode
      </button>
    </div>
  );
}

function LibraryCard({ entry, isCurrent, isPlaying, onPlay, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className={`group relative overflow-hidden rounded-3xl border bg-night-850 transition-all duration-250 hover:-translate-y-1 hover:shadow-[0_24px_56px_-16px_rgba(0,0,0,0.65)] ${
        isCurrent ? 'border-ember-500/35' : 'border-cream-50/8 hover:border-cream-50/16'
      }`}
    >
      <button onClick={() => onPlay(entry)} className="block w-full text-left" aria-label={`Play ${entry.title || entry.topic}`}>
        <div className="relative">
          <EpisodeArt seed={entry.topic} title={entry.title} playing={isCurrent && isPlaying} className="aspect-square w-full" />

          {/* Hover / playing overlay */}
          <div
            className={`absolute inset-0 flex items-center justify-center bg-night-950/45 transition-opacity duration-200 ${
              isCurrent ? 'opacity-100 bg-night-950/25' : 'opacity-0 group-hover:opacity-100'
            }`}
          >
            {isCurrent && isPlaying ? (
              <span className="eq scale-[1.6] text-cream-50">
                <i /><i /><i /><i />
              </span>
            ) : (
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-cream-50 text-night-900 shadow-2xl transition-transform duration-200 group-hover:scale-105">
                <Play size={21} fill="currentColor" className="ml-0.5" />
              </span>
            )}
          </div>
        </div>

        <div className="p-4">
          <h3 className="mb-1 line-clamp-2 font-display text-[1.05rem] leading-snug font-medium text-cream-50">
            {entry.title || entry.topic}
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-cream-500">
            <span className="flex items-center gap-1">
              <Clock size={10} /> {formatDuration(entry.durationMs)}
            </span>
            <span className="flex items-center gap-1">
              <Layers size={10} /> {entry.sourcesUsed?.length || 0} shows
            </span>
            <span>{formatSavedAt(entry.savedAt)}</span>
          </div>
        </div>
      </button>

      {/* Delete — two-step confirm */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirming) onDelete(entry.jobId);
          else {
            setConfirming(true);
            setTimeout(() => setConfirming(false), 2600);
          }
        }}
        aria-label={confirming ? 'Confirm delete' : `Delete ${entry.title || entry.topic}`}
        className={`absolute top-3 right-3 flex items-center gap-1.5 rounded-full px-2.5 py-2 text-[0.7rem] font-semibold backdrop-blur-md transition-all duration-200 ${
          confirming
            ? 'bg-error-400 text-night-950 opacity-100'
            : 'bg-night-950/60 text-cream-300 opacity-0 group-hover:opacity-100 hover:text-error-400'
        }`}
      >
        <Trash2 size={13} />
        {confirming && 'Sure?'}
      </button>
    </div>
  );
}

export default function Library({ entries, playingJobId, isPlaying, onPlay, onDelete, onNewEpisode }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const list = entries.slice().reverse();
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.topic || '').toLowerCase().includes(q) ||
        (e.sourcesUsed || []).some((s) => s.toLowerCase().includes(q)),
    );
  }, [entries, query]);

  if (entries.length === 0) return <EmptyState onNewEpisode={onNewEpisode} />;

  return (
    <div className="animate-entrance mx-auto w-full max-w-[880px] px-5 pt-10 pb-32">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 font-mono text-[0.66rem] tracking-[0.28em] text-ember-400 uppercase">Your collection</p>
          <h1 className="font-display text-[2.4rem] leading-none font-semibold text-cream-50">
            Library
            <span className="ml-3 align-middle font-mono text-[0.85rem] font-normal text-cream-500">
              {entries.length} episode{entries.length === 1 ? '' : 's'}
            </span>
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-cream-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search episodes…"
              aria-label="Search your library"
              className="w-[190px] rounded-full border border-cream-50/10 bg-cream-50/[0.04] py-2.5 pr-4 pl-9 text-[0.85rem] text-cream-100 transition-all outline-none placeholder:text-cream-500 focus:w-[230px] focus:border-ember-500/40"
            />
          </div>
          <button
            onClick={onNewEpisode}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-cream-50 px-4 py-2.5 text-[0.85rem] font-semibold text-night-900 transition-all hover:bg-white active:scale-[0.97]"
          >
            <Plus size={15} strokeWidth={2.5} /> New
          </button>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="py-16 text-center text-[0.9rem] text-cream-500">
          Nothing matches "{query}" — try another search.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((entry) => (
            <LibraryCard
              key={entry.jobId}
              entry={entry}
              isCurrent={entry.jobId === playingJobId}
              isPlaying={isPlaying}
              onPlay={onPlay}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      <p className="mt-10 text-center font-mono text-[0.65rem] leading-relaxed text-cream-600">
        Episodes are cached in your browser · download the MP3 to keep one forever
      </p>
    </div>
  );
}
