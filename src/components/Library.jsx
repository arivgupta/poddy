import React, { useMemo, useState } from 'react';
import { Clock, Layers, Trash2, Search, ArrowUpDown, Headphones } from 'lucide-react';
import TopicArtwork from './TopicArtwork';
import { getProgressFraction } from '../lib/playbackProgress';

function formatDuration(ms) {
  if (!ms) return '—';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function formatTotal(ms) {
  if (!ms) return '0m';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const SORTS = [
  { value: 'newest',   label: 'Newest first' },
  { value: 'oldest',   label: 'Oldest first' },
  { value: 'longest',  label: 'Longest' },
  { value: 'shortest', label: 'Shortest' },
  { value: 'az',       label: 'A → Z' },
];

export default function Library({ entries, onPlay, onDelete, onNewCast }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');

  const stats = useMemo(() => {
    const totalMs = entries.reduce((acc, e) => acc + (e.durationMs || 0), 0);
    const sources = new Set();
    entries.forEach((e) => (e.sourcesUsed || []).forEach((s) => sources.add(s)));
    return { count: entries.length, totalMs, uniqueSources: sources.size };
  }, [entries]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = entries.filter((e) => {
      if (!q) return true;
      const hay = `${e.title || ''} ${e.topic || ''} ${(e.sourcesUsed || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
    list = list.slice();
    switch (sort) {
      case 'oldest':   list.sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0)); break;
      case 'longest':  list.sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0)); break;
      case 'shortest': list.sort((a, b) => (a.durationMs || 0) - (b.durationMs || 0)); break;
      case 'az':       list.sort((a, b) => (a.title || a.topic || '').localeCompare(b.title || b.topic || '')); break;
      case 'newest':
      default:         list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)); break;
    }
    return list;
  }, [entries, query, sort]);

  if (entries.length === 0) {
    return (
      <div className="animate-entrance text-center py-20 px-8">
        <div className="text-5xl mb-6 opacity-30">🎙</div>
        <h2 className="font-display text-2xl mb-3 text-ink-500">Your library is empty</h2>
        <p className="text-ink-400 mb-8 text-base">Generate your first Poddy to see it here.</p>
        <button
          onClick={onNewCast}
          className="px-6 py-3 rounded-full bg-terra text-cream-50 font-semibold hover:bg-terra-light transition-colors shadow-[0_2px_10px_rgba(191,86,48,0.20)]"
        >
          Create Your First Cast
        </button>
      </div>
    );
  }

  return (
    <div className="animate-entrance w-full max-w-[820px]">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="font-display font-semibold text-[2.8rem] leading-none">
            Your <span className="text-terra">Library</span>
          </h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-ink-500 text-sm">
            <span className="flex items-center gap-1.5"><Headphones size={13} className="text-terra/70" /> {stats.count} cast{stats.count !== 1 ? 's' : ''}</span>
            <span className="flex items-center gap-1.5"><Clock size={13} className="text-terra/70" /> {formatTotal(stats.totalMs)} total</span>
            <span className="flex items-center gap-1.5"><Layers size={13} className="text-terra/70" /> {stats.uniqueSources} unique source{stats.uniqueSources !== 1 ? 's' : ''}</span>
          </div>
        </div>
        <button
          onClick={onNewCast}
          className="px-5 py-2.5 rounded-full bg-terra text-cream-50 font-semibold text-sm shrink-0 hover:bg-terra-light transition-colors shadow-[0_2px_8px_rgba(191,86,48,0.20)]"
        >
          + New Cast
        </button>
      </div>

      {/* Search + sort */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2 flex-1 min-w-[200px] px-4 py-2.5 rounded-full bg-cream-50 border border-ink-900/8 focus-within:border-terra/40 transition-colors">
          <Search size={16} className="text-ink-300 shrink-0" />
          <input
            type="text"
            placeholder="Search your library…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-ink-900 text-sm placeholder:text-ink-300"
          />
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-cream-50 border border-ink-900/8">
          <ArrowUpDown size={15} className="text-ink-300 shrink-0" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-transparent outline-none text-ink-900 text-sm cursor-pointer pr-1"
            aria-label="Sort library"
          >
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-16 text-ink-400">
          No casts match “{query}”.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((entry) => {
            const frac = getProgressFraction(entry.jobId, entry.durationMs);
            const pct = Math.round(frac * 100);
            return (
            <div
              key={entry.jobId}
              onClick={() => onPlay(entry)}
              className="group flex items-center gap-5 p-4 rounded-2xl bg-cream-50 shadow-[0_2px_12px_rgba(30,24,20,0.06)] cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(30,24,20,0.10)]"
            >
              <TopicArtwork topic={entry.topic} title={entry.title} size={64} />

              <div className="flex-1 min-w-0">
                <div className="font-display font-medium text-lg mb-0.5 truncate">{entry.title || entry.topic}</div>
                {entry.title && entry.title !== entry.topic && (
                  <div className="text-ink-400 text-[0.78rem] mb-1 truncate">{entry.topic}</div>
                )}
                <div className="flex gap-3 flex-wrap items-center">
                  <span className="flex items-center gap-1 text-ink-400 text-xs">
                    <Clock size={10} /> {formatDuration(entry.durationMs)}
                  </span>
                  <span className="flex items-center gap-1 text-ink-400 text-xs">
                    <Layers size={10} /> {entry.sourcesUsed?.length || 0} sources
                  </span>
                  <span className="text-ink-300 text-xs">
                    {formatDate(entry.savedAt)}
                  </span>
                  {pct > 0 && (
                    <span className="text-terra-dark text-xs font-medium">{pct}% played</span>
                  )}
                </div>
                {pct > 0 && (
                  <div className="mt-2 h-1 rounded-full bg-cream-300 overflow-hidden max-w-[280px]">
                    <div className="h-full bg-terra/70 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>

              <button
                onClick={e => { e.stopPropagation(); onDelete(entry.jobId); }}
                className="text-ink-300 p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:text-error hover:bg-error/7 transition-all shrink-0"
                title="Remove from library"
              >
                <Trash2 size={15} />
              </button>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
