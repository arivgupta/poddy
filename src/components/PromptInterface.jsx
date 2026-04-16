import React, { useState } from 'react';
import { Search, Sparkles, Headphones, Zap, BookOpen } from 'lucide-react';

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
      animation: 'fadeSlideUp 0.5s ease',
      position: 'relative',
    }}>

      {/* ── Background radial spotlight ──────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        top: '-60px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '700px',
        height: '400px',
        background: 'radial-gradient(ellipse at center, rgba(245,166,35,0.07) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      {/* ── Everything stacks above the glow ─────────────────────────────── */}
      <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* ── Hero text ────────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.3rem 0.8rem', borderRadius: '50px',
            background: 'var(--amber-glow)', border: '1px solid var(--amber-border)',
            color: 'var(--amber)', fontSize: '0.72rem', fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1.75rem',
          }}>
            <Zap size={10} /> AI Podcast Curator
          </div>

          <h1 className="display" style={{
            fontSize: 'clamp(2.6rem, 6vw, 4rem)',
            fontWeight: 700, lineHeight: 1.1,
            marginBottom: '1.25rem', letterSpacing: '-0.025em',
          }}>
            What do you want to<br />
            <span className="text-gradient">deeply understand</span>?
          </h1>

          <p style={{
            color: 'var(--text-secondary)', fontSize: '1rem',
            maxWidth: '440px', lineHeight: 1.7, margin: '0 auto',
          }}>
            AI finds the best moments from the world's top podcasts and assembles a curated audio documentary — just for you.
          </p>
        </div>

        {/* ── Main card ────────────────────────────────────────────────────── */}
        <form
          onSubmit={handleSubmit}
          className="glass-panel"
          style={{
            width: '100%', maxWidth: '640px',
            padding: 0, overflow: 'hidden',
            border: isFocused ? '1px solid var(--amber-border)' : 'var(--glass-border)',
            boxShadow: isFocused
              ? '0 0 0 4px rgba(245,166,35,0.06), 0 20px 60px rgba(0,0,0,0.5)'
              : '0 20px 60px rgba(0,0,0,0.4)',
            transition: 'all 0.3s ease',
            /* Top highlight stripe */
            borderTop: isFocused ? '1px solid rgba(245,166,35,0.5)' : '1px solid rgba(255,255,255,0.07)',
          }}
        >
          {/* Search input */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.85rem',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <Search
              size={18}
              color={isFocused ? 'var(--amber)' : 'var(--text-tertiary)'}
              style={{ flexShrink: 0, transition: 'color 0.25s' }}
            />
            <input
              type="text"
              placeholder="e.g. The neuroscience of motivation"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text-primary)', fontSize: '1.05rem',
                fontFamily: 'var(--font-body)',
              }}
            />
          </div>

          {/* Depth picker */}
          <div style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <p style={{
              color: 'var(--text-tertiary)', fontSize: '0.7rem',
              textTransform: 'uppercase', letterSpacing: '0.12em',
              marginBottom: '0.85rem', fontWeight: 600, textAlign: 'center',
            }}>
              How deep do you want to go?
            </p>
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center' }}>
              {DEPTHS.map(d => {
                const active = d.value === depth;
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDepth(d.value)}
                    style={{
                      flex: 1, maxWidth: '170px',
                      padding: '0.65rem 0.5rem',
                      borderRadius: '12px',
                      border: `1.5px solid ${active ? 'var(--amber)' : 'var(--border-subtle)'}`,
                      background: active ? 'var(--amber-glow)' : 'var(--bg-secondary)',
                      color: active ? 'var(--amber)' : 'var(--text-secondary)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
                      transition: 'all 0.2s',
                      fontFamily: 'var(--font-body)',
                      cursor: 'pointer',
                      position: 'relative',
                    }}
                    onMouseOver={e => {
                      if (!active) {
                        e.currentTarget.style.borderColor = 'var(--border-medium)';
                        e.currentTarget.style.color = 'var(--text-primary)';
                        e.currentTarget.style.background = 'var(--bg-tertiary)';
                      }
                    }}
                    onMouseOut={e => {
                      if (!active) {
                        e.currentTarget.style.borderColor = 'var(--border-subtle)';
                        e.currentTarget.style.color = 'var(--text-secondary)';
                        e.currentTarget.style.background = 'var(--bg-secondary)';
                      }
                    }}
                  >
                    {active && (
                      <div style={{
                        position: 'absolute', top: 6, right: 8,
                        width: 6, height: 6, borderRadius: '50%',
                        background: 'var(--amber)',
                        boxShadow: '0 0 6px var(--amber)',
                      }} />
                    )}
                    <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{d.label}</span>
                    <span style={{ fontSize: '0.7rem', opacity: 0.65 }}>{d.sources} · {d.time}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit */}
          <div style={{ padding: '1rem 1.5rem' }}>
            <button
              type="submit"
              style={{
                width: '100%',
                background: hasText
                  ? 'linear-gradient(120deg, var(--amber) 0%, var(--coral) 50%, var(--amber) 100%)'
                  : 'var(--bg-elevated)',
                backgroundSize: hasText ? '300% 100%' : '100% 100%',
                color: hasText ? 'black' : 'var(--text-muted)',
                padding: '0.95rem',
                borderRadius: '10px',
                fontWeight: 700, fontSize: '0.95rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                boxShadow: hasText ? '0 4px 24px rgba(245,166,35,0.25)' : 'none',
                transition: 'box-shadow 0.3s, color 0.3s',
                fontFamily: 'var(--font-body)',
                cursor: hasText ? 'pointer' : 'default',
                animation: hasText ? 'shimmer 2.5s ease-in-out infinite' : 'none',
              }}
              onMouseOver={e => { if (hasText) e.currentTarget.style.opacity = '0.9'; }}
              onMouseOut={e => { if (hasText) e.currentTarget.style.opacity = '1'; }}
            >
              <Sparkles size={16} />
              {depth === 'deep' ? 'Generate Full Deep Dive' : depth === 'quick' ? 'Generate Quick Brief' : 'Generate Poddy'}
            </button>
          </div>

          {/* Feature strip inside the card */}
          <div style={{
            display: 'flex', justifyContent: 'center', gap: '2rem',
            padding: '0.85rem 1.5rem',
            borderTop: '1px solid var(--border-subtle)',
            background: 'rgba(0,0,0,0.15)',
          }}>
            {[
              { icon: Headphones, label: 'Real Podcasts' },
              { icon: Sparkles,   label: 'AI Narrated' },
              { icon: BookOpen,   label: 'Curriculum Ordered' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                color: 'var(--text-tertiary)', fontSize: '0.75rem',
              }}>
                <Icon size={12} color="var(--amber)" /> {label}
              </div>
            ))}
          </div>
        </form>

        {/* ── Suggestion chips ────────────────────────────────────────────── */}
        <div style={{
          marginTop: '1.75rem',
          display: 'flex', flexWrap: 'wrap', gap: '0.55rem',
          justifyContent: 'center', maxWidth: '640px',
        }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', width: '100%', textAlign: 'center', marginBottom: '0.25rem', letterSpacing: '0.05em' }}>
            Try one of these
          </span>
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setQuery(s)}
              style={{
                padding: '0.38rem 0.85rem', borderRadius: '50px',
                background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)', fontSize: '0.82rem',
                transition: 'all 0.18s', fontFamily: 'var(--font-body)', cursor: 'pointer',
              }}
              onMouseOver={e => {
                e.currentTarget.style.borderColor = 'var(--amber-border)';
                e.currentTarget.style.color = 'var(--amber)';
                e.currentTarget.style.background = 'var(--amber-glow)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.color = 'var(--text-secondary)';
                e.currentTarget.style.background = 'var(--bg-secondary)';
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
