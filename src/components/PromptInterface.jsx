import React, { useState } from 'react';
import { Search, Sparkles, Headphones, BookOpen } from 'lucide-react';

const DEPTHS = [
  { label: 'Quick Brief',    value: 'quick',    sources: '2 sources', time: '~10 min' },
  { label: 'Standard',       value: 'standard', sources: '3 sources', time: '~25 min' },
  { label: 'Full Deep Dive', value: 'deep',     sources: '5 sources', time: '~50 min' },
];

const SUGGESTIONS = [
  'The science of deep sleep',
  'How to build unbreakable discipline',
  'Longevity, fasting, and health span',
  'Dopamine, motivation, and focus',
  'How to write a number one pop song',
  'The psychology of high performance',
];

export default function PromptInterface({ onSynthesize }) {
  const [query, setQuery] = useState('');
  const [depth, setDepth] = useState('standard');
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) onSynthesize(query, depth);
  };

  const hasText = query.trim().length > 0;

  return (
    <div style={{
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      position: 'relative',
    }}>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* ── Hero ───────────────────────────────── */}
        <div className="entrance-1" style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 className="display" style={{
            fontSize: 'clamp(2.6rem, 6vw, 4.2rem)',
            lineHeight: 1.08,
            marginBottom: '1.25rem',
          }}>
            What do you want to<br />
            <em className="text-gradient" style={{ fontStyle: 'italic' }}>deeply understand</em>?
          </h1>

          <p style={{
            color: 'var(--text-secondary)', fontSize: '1.05rem',
            maxWidth: '460px', lineHeight: 1.7, margin: '0 auto',
            fontWeight: 400,
          }}>
            We find the best moments from the world's top podcasts and assemble a curated listen — just for you.
          </p>
        </div>

        {/* ── Main card ──────────────────────────── */}
        <form
          onSubmit={handleSubmit}
          className="glass-panel entrance-2"
          style={{
            width: '100%', maxWidth: '620px',
            padding: 0, overflow: 'hidden',
            border: isFocused ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)',
            boxShadow: isFocused
              ? '0 0 0 3px var(--accent-subtle), 0 8px 32px rgba(30,24,20,0.06)'
              : '0 4px 24px rgba(30,24,20,0.04)',
            transition: `all var(--dur-std) var(--ease-out)`,
          }}
        >
          {/* Search input */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.85rem',
            padding: '1.15rem 1.4rem',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
          }}>
            <Search
              size={18}
              color={isFocused ? 'var(--accent)' : 'var(--text-muted)'}
              style={{ flexShrink: 0, transition: `color var(--dur-fast) var(--ease-out)` }}
            />
            <input
              type="text"
              placeholder="What do you want to learn about?"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text-primary)', fontSize: '1.05rem',
                fontFamily: 'var(--font-body)',
                letterSpacing: '0.01em',
              }}
            />
          </div>

          {/* Depth picker */}
          <div style={{
            padding: '1.15rem 1.4rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <p style={{
              color: 'var(--text-tertiary)', fontSize: '0.68rem',
              textTransform: 'uppercase', letterSpacing: '0.14em',
              marginBottom: '0.75rem', fontWeight: 600, textAlign: 'center',
            }}>
              Depth
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
              {DEPTHS.map(d => {
                const active = d.value === depth;
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDepth(d.value)}
                    style={{
                      flex: 1, maxWidth: '165px',
                      padding: '0.6rem 0.5rem',
                      borderRadius: '10px',
                      border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border-medium)'}`,
                      background: active ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                      color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem',
                      transition: `all var(--dur-fast) var(--ease-out)`,
                      cursor: 'pointer',
                    }}
                    onMouseOver={e => {
                      if (!active) {
                        e.currentTarget.style.borderColor = 'var(--border-strong)';
                        e.currentTarget.style.background = 'var(--bg-inset)';
                      }
                    }}
                    onMouseOut={e => {
                      if (!active) {
                        e.currentTarget.style.borderColor = 'var(--border-medium)';
                        e.currentTarget.style.background = 'var(--bg-elevated)';
                      }
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{d.label}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{d.sources} · {d.time}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit */}
          <div style={{ padding: '0.9rem 1.4rem', background: 'var(--bg-surface)' }}>
            <button
              type="submit"
              style={{
                width: '100%',
                background: hasText ? 'var(--accent)' : 'var(--bg-inset)',
                color: hasText ? 'var(--bg-surface)' : 'var(--text-muted)',
                padding: '0.85rem',
                borderRadius: '10px',
                fontWeight: 600, fontSize: '0.92rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                boxShadow: hasText ? '0 2px 10px rgba(191,86,48,0.18)' : 'none',
                transition: `all var(--dur-std) var(--ease-out)`,
                cursor: hasText ? 'pointer' : 'default',
                letterSpacing: '0.02em',
              }}
              onMouseOver={e => { if (hasText) e.currentTarget.style.background = 'var(--accent-hover)'; }}
              onMouseOut={e => { if (hasText) e.currentTarget.style.background = 'var(--accent)'; }}
            >
              <Sparkles size={15} />
              Generate
            </button>
          </div>

          {/* Feature strip */}
          <div style={{
            display: 'flex', justifyContent: 'center', gap: '1.75rem',
            padding: '0.75rem 1.4rem',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-inset)',
          }}>
            {[
              { icon: Headphones, label: 'Real Podcasts' },
              { icon: Sparkles,   label: 'AI Narrated' },
              { icon: BookOpen,   label: 'Curriculum Ordered' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                color: 'var(--text-tertiary)', fontSize: '0.72rem',
                letterSpacing: '0.02em',
              }}>
                <Icon size={11} color="var(--accent)" /> {label}
              </div>
            ))}
          </div>
        </form>

        {/* ── Suggestion chips ───────────────────── */}
        <div className="entrance-3" style={{
          marginTop: '1.5rem',
          display: 'flex', flexWrap: 'wrap', gap: '0.45rem',
          justifyContent: 'center', maxWidth: '620px',
        }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', width: '100%', textAlign: 'center', marginBottom: '0.15rem', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 500 }}>
            Try one of these
          </span>
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setQuery(s)}
              style={{
                padding: '0.32rem 0.75rem', borderRadius: '50px',
                background: 'var(--bg-surface)', border: '1px solid var(--border-medium)',
                color: 'var(--text-secondary)', fontSize: '0.8rem',
                transition: `all var(--dur-fast) var(--ease-out)`, cursor: 'pointer',
              }}
              onMouseOver={e => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.color = 'var(--accent-text)';
                e.currentTarget.style.background = 'var(--accent-subtle)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.borderColor = 'var(--border-medium)';
                e.currentTarget.style.color = 'var(--text-secondary)';
                e.currentTarget.style.background = 'var(--bg-surface)';
              }}
            >
              {s}
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
