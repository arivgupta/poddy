import React from 'react';
import { Play, Clock, Mic2, Trash2, Layers } from 'lucide-react';

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
      <div style={{ textAlign: 'center', padding: '5rem 2rem', animation: 'fadeSlideUp 0.4s ease' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1.5rem', opacity: 0.25 }}>🎙</div>
        <h2 className="display" style={{ fontSize: '2rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
          Your library is empty
        </h2>
        <p style={{ color: 'var(--text-tertiary)', marginBottom: '2rem' }}>
          Generate your first Poddy to see it here.
        </p>
        <button
          onClick={onNewCast}
          style={{ padding: '0.75rem 1.75rem', borderRadius: '50px', background: 'var(--amber)', color: 'black', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
        >
          Create Your First Cast
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: '820px', animation: 'fadeSlideUp 0.4s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
        <div>
          <h2 className="display" style={{ fontSize: '2.8rem', fontWeight: 700, lineHeight: 1.1 }}>
            Your <span className="text-gradient">Library</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            {entries.length} Poddy{entries.length !== 1 ? 's' : ''} saved
          </p>
        </div>
        <button
          onClick={onNewCast}
          style={{ padding: '0.65rem 1.5rem', borderRadius: '50px', background: 'var(--amber)', color: 'black', fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'var(--font-body)', flexShrink: 0 }}
        >
          + New Cast
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {entries.slice().reverse().map((entry) => (
          <div
            key={entry.jobId}
            className="glass-panel"
            style={{
              display: 'flex', alignItems: 'center', gap: '1.5rem',
              padding: '1.25rem 1.5rem',
              cursor: 'pointer',
              transition: 'all 0.22s',
              borderRadius: '16px',
            }}
            onMouseOver={e => { e.currentTarget.style.border = '1px solid var(--amber-border)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
            onMouseOut={e => { e.currentTarget.style.border = 'var(--glass-border)'; e.currentTarget.style.transform = 'none'; }}
            onClick={() => onPlay(entry)}
          >
            {/* Play button */}
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-medium)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}>
              <Play size={18} color="var(--amber)" fill="var(--amber)" style={{ marginLeft: 2 }} />
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="display" style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '0.35rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entry.topic}
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>
                  <Clock size={11} /> {formatDuration(entry.durationMs)}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>
                  <Layers size={11} /> {entry.sourcesUsed?.length || 0} sources
                </span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>
                  {formatDate(entry.savedAt)}
                </span>
              </div>
              {/* Source chips */}
              {entry.sourcesUsed?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.5rem' }}>
                  {entry.sourcesUsed.slice(0, 3).map((s, i) => (
                    <span key={i} style={{ padding: '0.15rem 0.5rem', borderRadius: '50px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                      {s}
                    </span>
                  ))}
                  {entry.sourcesUsed.length > 3 && (
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.72rem', alignSelf: 'center' }}>
                      +{entry.sourcesUsed.length - 3} more
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Delete */}
            <button
              onClick={e => { e.stopPropagation(); onDelete(entry.jobId); }}
              style={{ color: 'var(--text-muted)', padding: '0.5rem', borderRadius: '8px', background: 'transparent', flexShrink: 0, transition: 'all 0.18s' }}
              onMouseOver={e => { e.currentTarget.style.color = 'var(--coral)'; e.currentTarget.style.background = 'var(--coral-glow)'; }}
              onMouseOut={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
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
