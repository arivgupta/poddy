import React, { useEffect, useMemo, useState } from 'react';
import {
  LoaderCircle, Search, Headphones, Scissors, BookOpenCheck,
  PencilLine, AudioLines, Check, X, TriangleAlert, RotateCcw, SquarePen,
} from 'lucide-react';
import { STAGES, stageIndex, progressCeiling, progressFloor, ETA_BY_DEPTH, DEPTHS } from '../lib/stages';
import { formatElapsed } from '../lib/format';

const STAGE_ICONS = {
  queued: LoaderCircle,
  discovering_sources: Search,
  downloading_transcribing: Headphones,
  extracting_clips: Scissors,
  building_curriculum: BookOpenCheck,
  writing_narration: PencilLine,
  stitching: AudioLines,
};

function useElapsedSeconds(startedAt) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startedAt) / 1000));
  useEffect(() => {
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [startedAt]);
  return Math.max(0, elapsed);
}

/** Eases displayed progress toward the current stage ceiling — honest but alive. */
function useSmoothProgress(status) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const floor = progressFloor(status);
    const ceiling = progressCeiling(status) - 0.008;
    const iv = setInterval(() => {
      setDisplay((current) => {
        // Jump forward if a stage completed while we were easing.
        const base = Math.max(current, floor);
        return base + (ceiling - base) * 0.03;
      });
    }, 300);
    return () => clearInterval(iv);
  }, [status]);

  return display;
}

function ProducingVisual({ status }) {
  const Icon = STAGE_ICONS[status] || LoaderCircle;
  return (
    <div className="relative mx-auto mb-10 flex h-32 w-32 items-center justify-center">
      {/* Expanding broadcast rings */}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="animate-ring-expand absolute inset-0 rounded-full border border-ember-500/40"
          style={{ animationDelay: `${i * 1.05}s` }}
        />
      ))}
      {/* Core */}
      <div className="animate-glow-pulse relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-ember-400 to-ember-600">
        <Icon
          size={26}
          className={`text-night-950 ${Icon === LoaderCircle ? 'animate-spin' : ''}`}
          strokeWidth={2.2}
        />
      </div>
    </div>
  );
}

function StageRow({ stage, state, sourceNames }) {
  const showSources = stage.key === 'downloading_transcribing' && sourceNames.length > 0 && state !== 'pending';
  return (
    <li className="relative flex gap-4 pb-1">
      {/* Marker */}
      <div className="flex flex-col items-center">
        <div
          className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all duration-500 ${
            state === 'done'
              ? 'border-ember-500/60 bg-ember-500/15 text-ember-400'
              : state === 'active'
                ? 'border-ember-400 bg-ember-500 text-night-950 shadow-[0_0_16px_rgba(233,104,58,0.5)]'
                : 'border-cream-50/12 bg-night-800 text-cream-600'
          }`}
        >
          {state === 'done' ? (
            <Check size={13} strokeWidth={3} />
          ) : state === 'active' ? (
            <LoaderCircle size={13} strokeWidth={2.8} className="animate-spin" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
          )}
        </div>
        <div className={`w-px flex-1 ${state === 'done' ? 'bg-ember-500/35' : 'bg-cream-50/8'}`} />
      </div>

      {/* Copy */}
      <div className={`pb-5 transition-opacity duration-500 ${state === 'pending' ? 'opacity-40' : ''}`}>
        <p
          className={`text-[0.95rem] leading-7 font-medium ${
            state === 'active' ? 'shimmer-active' : state === 'done' ? 'text-cream-300' : 'text-cream-400'
          }`}
        >
          {stage.label}
        </p>
        {state === 'active' && (
          <p className="animate-fade-in mt-0.5 max-w-[380px] text-[0.8rem] leading-relaxed text-cream-400">
            {stage.blurb}
          </p>
        )}
        {showSources && (
          <div className="mt-2.5 flex max-w-[420px] flex-wrap gap-1.5">
            {sourceNames.map((name) => (
              <span
                key={name}
                className="animate-scale-in rounded-full border border-gold-300/25 bg-gold-300/8 px-2.5 py-1 text-[0.72rem] font-medium text-gold-300"
              >
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

export default function Studio({ generation, onCancel, onRetry, onEditPrompt, onBrowseLibrary, hasLibrary }) {
  const { topic, title, status, sourceNames = [], startedAt, depth, error } = generation;
  const elapsed = useElapsedSeconds(startedAt);
  const progress = useSmoothProgress(status);
  const isError = status === 'error';
  const currentIdx = stageIndex(status);

  const depthMeta = useMemo(() => DEPTHS.find((d) => d.value === depth), [depth]);

  if (isError) {
    return (
      <div className="animate-entrance mx-auto w-full max-w-[560px] px-5 pt-16 pb-24 text-center">
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full border border-error-400/30 bg-error-400/10">
          <TriangleAlert size={30} className="text-error-400" />
        </div>
        <p className="mb-3 font-mono text-[0.68rem] tracking-[0.28em] text-error-400 uppercase">Production failed</p>
        <h2 className="mb-4 font-display text-[1.9rem] leading-tight font-semibold text-cream-50">
          We couldn't finish "{title || topic}"
        </h2>
        <p className="mx-auto mb-10 max-w-[420px] text-[0.92rem] leading-relaxed text-cream-400">
          {error || 'Something went wrong in the studio. This is usually temporary — the shows we needed may have been unreachable.'}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onRetry}
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-ember-500 to-ember-400 px-6 py-3 text-[0.92rem] font-semibold text-night-950 shadow-[0_8px_28px_rgba(233,104,58,0.35)] transition-all hover:brightness-105 active:scale-[0.98]"
          >
            <RotateCcw size={16} /> Try again
          </button>
          <button
            onClick={onEditPrompt}
            className="flex items-center gap-2 rounded-2xl border border-cream-50/15 px-6 py-3 text-[0.92rem] font-medium text-cream-200 transition-colors hover:border-cream-50/30 hover:text-cream-50"
          >
            <SquarePen size={16} /> Edit the prompt
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-entrance mx-auto w-full max-w-[600px] px-5 pt-12 pb-28 text-center">
      <ProducingVisual status={status} />

      <p className="mb-3 font-mono text-[0.68rem] tracking-[0.28em] text-ember-400 uppercase">
        Now producing{depthMeta ? ` · ${depthMeta.label}` : ''}
      </p>
      <h2 className="mb-2 font-display text-[clamp(1.7rem,4.5vw,2.4rem)] leading-tight font-semibold text-cream-50">
        {title ? `"${title}"` : `"${topic}"`}
      </h2>
      {title && title.toLowerCase() !== topic.toLowerCase() && (
        <p className="mb-2 text-[0.85rem] text-cream-500">from your prompt: {topic}</p>
      )}

      <p className="mb-10 font-mono text-[0.72rem] tracking-wide text-cream-400">
        {formatElapsed(elapsed)} elapsed · usually {ETA_BY_DEPTH[depth] || ETA_BY_DEPTH.standard}
      </p>

      {/* Progress bar */}
      <div className="mb-1.5 h-1 w-full overflow-hidden rounded-full bg-cream-50/8">
        <div
          className="h-full rounded-full bg-gradient-to-r from-ember-600 via-ember-500 to-ember-300 transition-[width] duration-700 ease-out"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <div className="mb-10 flex justify-between font-mono text-[0.65rem] text-cream-500">
        <span>mixing in progress</span>
        <span>{Math.round(progress * 100)}%</span>
      </div>

      {/* Stage timeline */}
      <ol className="mx-auto max-w-[440px] text-left">
        {STAGES.map((stage, i) => (
          <StageRow
            key={stage.key}
            stage={stage}
            sourceNames={sourceNames}
            state={i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending'}
          />
        ))}
      </ol>

      {/* Footer actions */}
      <div className="mt-8 flex flex-col items-center gap-4">
        {hasLibrary && (
          <p className="text-[0.8rem] text-cream-500">
            This takes a few minutes —{' '}
            <button onClick={onBrowseLibrary} className="font-medium text-cream-300 underline decoration-cream-50/25 underline-offset-4 transition-colors hover:text-ember-300">
              listen to something from your library
            </button>{' '}
            while you wait.
          </p>
        )}
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded-full border border-cream-50/12 px-4 py-2 text-[0.8rem] font-medium text-cream-400 transition-colors hover:border-error-400/40 hover:text-error-400"
        >
          <X size={13} /> Cancel production
        </button>
      </div>
    </div>
  );
}
