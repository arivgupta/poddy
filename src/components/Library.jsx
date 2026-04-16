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
      <div className="entrance" style={{ textAlign: 'center', padding: '5rem 2rem' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '1.5rem', opacity: 0.3 }}>🎙</div>
        <h2 className="display" style={{ fontSize: '2rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>
          Your library is empty
        </h2>
        <p style={{ color: 'var(--text-tertiary)', marginBottom: '2rem', fontSize: '0.95rem' }}>
          Generate your first Poddy to see it here.
        </p>
        <button
          onClick={onNewCast}
          style={{ padding: '0.7rem 1.6rem', borderRadius: '50px', background: 'var(--accent)', color: 'var(--bg-surface)', fontWeight: 600, fontSize: '0.92rem', cursor: 'pointer', transition: `background var(--dur-fast) var(--ease-out)` }}
          onMouseOver={e => e.currentTarget.style.background = 'var(--accent-hover)'}
          onMouseOut={e => e.currentTarget.style.background = 'var(--accent)'}
        >
          Create Your First Cast
        </button>
      </div>
    );
  }

  return (
    <div className="entrance" style={{ width: '100%', maxWidth: '820px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
        <div>
          <h2 className="display" style={{ fontSize: '2.8rem', lineHeight: 1.08 }}>
            Your <em className="text-gradient" style={{ fontStyle: 'italic' }}>Library</em>
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: '0.4rem', fontSize: '0.92rem' }}>
            {entries.length} Poddy{entries.length !== 1 ? 's' : ''} saved
          </p>
        </div>
        <button
          onClick={onNewCast}
          style={{ padding: '0.55rem 1.3rem', borderRadius: '50px', background: 'var(--accent)', color: 'var(--bg-surface)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', flexShrink: 0, transition: `background var(--dur-fast) var(--ease-out)` }}
          onMouseOver={e => e.currentTarget.style.background = 'var(--accent-hover)'}
          onMouseOut={e => e.currentTarget.style.background = 'var(--accent)'}
        >
          + New Cast
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {entries.slice().reverse().map((entry) => (
          <div
            key={entry.jobId}
            className="glass-panel"
            style={{
              display: 'flex', alignItems: 'center', gap: '1.25rem',
              padding: '1.1rem 1.3rem',
              cursor: 'pointer',
              transition: `all var(--dur-fast) var(--ease-out)`,
              borderRadius: '14px',
            }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent-border)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(30,24,20,0.06)'; }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(30,24,20,0.04), 0 4px 16px rgba(30,24,20,0.03)'; }}
            onClick={() => onPlay(entry)}
          >
            <TopicArtwork topic={entry.topic} title={entry.title} size={48} />

            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="display" style={{ fontSize: '1.05rem', marginBottom: entry.title && entry.title !== entry.topic ? '0.1rem' : '0.3rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entry.title || entry.topic}
              </div>
              {entry.title && entry.title !== entry.topic && (
                <div style={{ color: 'var(--text-tertiary)', fontSize: '0.76rem', marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontStyle: 'italic' }}>
                  {entry.topic}
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                  <Clock size={10} /> {formatDuration(entry.durationMs)}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
                  <Layers size={10} /> {entry.sourcesUsed?.length || 0} sources
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  {formatDate(entry.savedAt)}
                </span>
              </div>
            </div>

            <button
              onClick={e => { e.stopPropagation(); onDelete(entry.jobId); }}
              style={{ color: 'var(--text-muted)', padding: '0.4rem', borderRadius: '8px', background: 'transparent', flexShrink: 0, transition: `all var(--dur-fast) var(--ease-out)` }}
              onMouseOver={e => { e.currentTarget.style.color = 'var(--error)'; e.currentTarget.style.background = 'var(--error-subtle)'; }}
              onMouseOut={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent'; }}
              title="Remove from library"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
