import React from 'react';
import { Clock, Layers, Trash2 } from 'lucide-react';
import TopicArtwork from './TopicArtwork';

function formatDuration(ms) {
  if (!ms) return '—';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function Library({ entries, onPlay, onDelete, onNewCast }) {
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
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="font-display font-semibold text-[2.8rem] leading-none">
            Your <span className="text-terra">Library</span>
          </h2>
          <p className="text-ink-500 mt-2 text-sm">
            {entries.length} Poddy{entries.length !== 1 ? 's' : ''} saved
          </p>
        </div>
        <button
          onClick={onNewCast}
          className="px-5 py-2.5 rounded-full bg-terra text-cream-50 font-semibold text-sm shrink-0 hover:bg-terra-light transition-colors shadow-[0_2px_8px_rgba(191,86,48,0.20)]"
        >
          + New Cast
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {entries.slice().reverse().map((entry) => (
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
              </div>
            </div>

            <button
              onClick={e => { e.stopPropagation(); onDelete(entry.jobId); }}
              className="text-ink-300 p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:text-error hover:bg-error/7 transition-all shrink-0"
              title="Remove from library"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
