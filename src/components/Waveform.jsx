import React, { useCallback, useMemo, useRef, useState } from 'react';
import { hashString, makeRandom } from '../lib/artwork';
import { formatClock } from '../lib/format';

const BAR_COUNT = 110;
const BAR_W = 3;
const GAP = 2;
const VIEW_W = BAR_COUNT * (BAR_W + GAP) - GAP;
const VIEW_H = 64;

function buildBars(seed) {
  const rand = makeRandom(hashString(seed || 'poddy'));
  const bars = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    const t = i / BAR_COUNT;
    const envelope = 0.45 + 0.4 * Math.sin(t * Math.PI); // quieter at the edges
    const phrase = 0.28 * Math.sin(i * 0.35 + rand() * 4) + 0.18 * Math.sin(i * 0.11 + 2.2);
    const noise = rand() * 0.5 - 0.1;
    bars.push(Math.min(1, Math.max(0.09, envelope + phrase * 0.6 + noise * 0.55 - 0.18)));
  }
  return bars;
}

/**
 * Interactive faux-waveform seek bar with chapter notches and a hover
 * time tooltip. Deterministic shape per episode (seeded by jobId).
 */
export default function Waveform({ seed, currentMs, durationMs, chapters = [], onSeek }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null); // { x: px, ms }
  const [dragging, setDragging] = useState(false);

  const bars = useMemo(() => buildBars(seed), [seed]);
  const progress = durationMs > 0 ? Math.min(1, currentMs / durationMs) : 0;
  const progressX = progress * VIEW_W;

  const chapterXs = useMemo(() => {
    if (!durationMs) return [];
    return chapters
      .filter((c) => c.start_ms > 500)
      .map((c) => (c.start_ms / durationMs) * VIEW_W);
  }, [chapters, durationMs]);

  const msFromClientX = useCallback(
    (clientX) => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (!rect || !durationMs) return 0;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return pct * durationMs;
    },
    [durationMs],
  );

  const handlePointerDown = (e) => {
    if (!durationMs) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    onSeek?.(msFromClientX(e.clientX));
  };

  const handlePointerMove = (e) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) {
      setHover({ x: e.clientX - rect.left, ms: msFromClientX(e.clientX) });
    }
    if (dragging) onSeek?.(msFromClientX(e.clientX));
  };

  const handlePointerUp = (e) => {
    if (dragging) {
      onSeek?.(msFromClientX(e.clientX));
      setDragging(false);
    }
  };

  const handleKeyDown = (e) => {
    if (!durationMs) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onSeek?.(Math.min(currentMs + 15000, durationMs));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onSeek?.(Math.max(currentMs - 15000, 0));
    }
  };

  return (
    <div
      ref={wrapRef}
      role="slider"
      tabIndex={0}
      aria-label="Seek"
      aria-valuemin={0}
      aria-valuemax={Math.round(durationMs / 1000)}
      aria-valuenow={Math.round(currentMs / 1000)}
      aria-valuetext={`${formatClock(currentMs)} of ${formatClock(durationMs)}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => setHover(null)}
      onKeyDown={handleKeyDown}
      className="group relative w-full cursor-pointer touch-none select-none py-1 focus-visible:outline-none"
    >
      {/* Hover tooltip */}
      {hover && durationMs > 0 && (
        <div
          className="pointer-events-none absolute -top-7 z-10 -translate-x-1/2 rounded-md border border-cream-50/10 bg-night-700 px-2 py-0.5 font-mono text-[0.68rem] text-cream-100 shadow-lg"
          style={{ left: hover.x }}
        >
          {formatClock(hover.ms)}
        </div>
      )}

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="block h-[58px] w-full sm:h-[66px]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="wave-played" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F2A56B" />
            <stop offset="100%" stopColor="#E9683A" />
          </linearGradient>
        </defs>

        {bars.map((h, i) => {
          const x = i * (BAR_W + GAP);
          const barH = Math.max(3, h * (VIEW_H - 10));
          const y = (VIEW_H - barH) / 2;
          const barCenter = x + BAR_W / 2;
          const played = barCenter <= progressX;
          return (
            <rect
              key={i}
              className="wave-bar"
              x={x}
              y={y}
              width={BAR_W}
              height={barH}
              rx={1.5}
              fill={played ? 'url(#wave-played)' : 'rgba(247,241,231,0.16)'}
            />
          );
        })}

        {/* Chapter notches */}
        {chapterXs.map((x, i) => (
          <rect key={`c${i}`} x={x - 0.75} y={0} width={1.5} height={5} rx={0.75} fill="rgba(247,241,231,0.45)" />
        ))}

        {/* Playhead */}
        {durationMs > 0 && (
          <rect
            x={Math.min(progressX, VIEW_W - 1.5)}
            y={4}
            width={1.5}
            height={VIEW_H - 8}
            rx={0.75}
            fill="#F7F1E7"
            opacity={dragging ? 1 : 0.85}
          />
        )}
      </svg>
    </div>
  );
}
