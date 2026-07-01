import React, { useMemo, useState } from 'react';
import { Dices, Radio, ListMusic, BookOpenCheck, ArrowRight, Play } from 'lucide-react';
import Composer from '../components/Composer';
import EpisodeArt from '../components/EpisodeArt';
import { formatDuration } from '../lib/format';
import { hashString } from '../lib/artwork';

const TOPIC_POOL = [
  'How dopamine actually drives motivation',
  'Why we sleep — and what happens when we don\'t',
  'The gut–brain connection, explained',
  'Stoicism as a practical operating system',
  'The science of longevity and healthspan',
  'How great teams make decisions fast',
  'What large language models actually do',
  'The psychology of habit formation',
  'How the immune system learns',
  'Negotiation tactics from the world\'s best closers',
  'The hidden economics of streaming music',
  'How memory works — and how to train it',
  'The neuroscience of focus in a distracted world',
  'How startups find their first hundred users',
  'The physics of black holes, minus the math',
  'Thinking about risk like a poker pro',
  'Creatine, protein, and muscle myths',
  'The story of the transistor',
];

function pickTopics(offset) {
  const picked = [];
  for (let i = 0; i < 4; i++) {
    picked.push(TOPIC_POOL[(offset + i * 5) % TOPIC_POOL.length]);
  }
  return picked;
}

const CRAFT_STEPS = [
  {
    n: '01',
    title: 'Curate',
    icon: Radio,
    text: 'We scout thousands of shows and pull the episodes where real experts go deep on your question.',
  },
  {
    n: '02',
    title: 'Clip',
    icon: ListMusic,
    text: 'Every episode is transcribed, and only the sharpest, information-dense minutes make the cut.',
  },
  {
    n: '03',
    title: 'Compose',
    icon: BookOpenCheck,
    text: 'A narrator stitches the clips into one chaptered episode, ordered like a great lecture.',
  },
];

export default function Home({
  onSubmit,
  composerDisabled,
  onBlockedSubmit,
  prefillTopic,
  focusSignal,
  recentEntries = [],
  playingJobId = null,
  onPlayEntry,
  onOpenLibrary,
}) {
  const [shuffle, setShuffle] = useState(() => hashString(new Date().toDateString()) % TOPIC_POOL.length);
  const suggestions = useMemo(() => pickTopics(shuffle), [shuffle]);
  const [suggestionTopic, setSuggestionTopic] = useState('');

  const recent = recentEntries.slice(-4).reverse();

  return (
    <div className="w-full">
      {/* Hero */}
      <section className="relative mx-auto flex w-full max-w-[820px] flex-col items-center px-5 pt-14 pb-10 text-center sm:pt-20">
        {/* Ambient glow behind hero */}
        <div
          aria-hidden="true"
          className="animate-drift pointer-events-none absolute -top-24 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full opacity-60"
          style={{
            background:
              'radial-gradient(closest-side, rgba(233,104,58,0.16), rgba(233,104,58,0.05) 55%, transparent 75%)',
          }}
        />

        <p className="animate-entrance relative mb-5 font-mono text-[0.7rem] font-medium tracking-[0.28em] text-ember-400 uppercase">
          Your personal audio documentary studio
        </p>

        <h1 className="animate-entrance delay-1 relative mb-6 font-display text-[clamp(2.6rem,7vw,4.6rem)] leading-[1.04] font-semibold tracking-[-0.02em] text-cream-50">
          Any question.
          <br />
          <em className="text-gradient-ember font-medium italic">One perfect episode.</em>
        </h1>

        <p className="animate-entrance delay-2 relative mb-12 max-w-[460px] text-[1.02rem] leading-relaxed text-cream-300">
          Poddy hunts through the world's best podcasts, clips the sharpest
          minutes, and stitches them into a single narrated episode — made for you.
        </p>

        <div className="animate-entrance delay-3 relative w-full max-w-[620px]">
          <Composer
            onSubmit={onSubmit}
            disabled={composerDisabled}
            onBlockedSubmit={onBlockedSubmit}
            initialTopic={prefillTopic || suggestionTopic}
            focusSignal={focusSignal}
          />
        </div>

        {/* Suggestions */}
        <div className="animate-entrance delay-4 relative mt-8 flex w-full max-w-[620px] flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => setShuffle((s) => s + 1)}
            className="flex items-center gap-1.5 rounded-full border border-cream-50/10 px-3 py-1.5 font-mono text-[0.68rem] tracking-wide text-cream-400 uppercase transition-colors hover:border-cream-50/25 hover:text-cream-100"
            aria-label="Shuffle suggestions"
          >
            <Dices size={12} />
            Need a spark?
          </button>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setSuggestionTopic(s)}
              className="rounded-full border border-cream-50/8 bg-cream-50/[0.03] px-3.5 py-1.5 text-[0.8rem] text-cream-300 transition-all duration-200 hover:border-ember-500/35 hover:bg-ember-500/10 hover:text-ember-300"
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* Recent episodes strip */}
      {recent.length > 0 && (
        <section className="animate-entrance delay-4 mx-auto w-full max-w-[820px] px-5 pt-4 pb-2">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-[1.35rem] font-medium text-cream-100">Jump back in</h2>
            <button
              onClick={onOpenLibrary}
              className="flex items-center gap-1 text-[0.8rem] font-medium text-cream-400 transition-colors hover:text-ember-300"
            >
              Library <ArrowRight size={13} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {recent.map((entry) => {
              const isCurrent = entry.jobId === playingJobId;
              return (
                <button
                  key={entry.jobId}
                  onClick={() => onPlayEntry(entry)}
                  className="group relative overflow-hidden rounded-2xl border border-cream-50/8 bg-night-850 text-left transition-all duration-250 hover:-translate-y-0.5 hover:border-cream-50/18 hover:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.6)]"
                >
                  <EpisodeArt seed={entry.topic} title={entry.title} playing={isCurrent} className="aspect-square w-full" />
                  <div className="absolute inset-0 flex items-center justify-center bg-night-950/45 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-cream-50 text-night-900 shadow-xl">
                      <Play size={17} fill="currentColor" className="ml-0.5" />
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="truncate text-[0.82rem] font-medium text-cream-100">{entry.title || entry.topic}</p>
                    <p className="mt-0.5 font-mono text-[0.62rem] text-cream-500">{formatDuration(entry.durationMs)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* How it works */}
      <section className="mx-auto w-full max-w-[820px] px-5 pt-16 pb-20">
        <div className="mb-8 flex items-center gap-4">
          <h2 className="shrink-0 font-mono text-[0.68rem] font-medium tracking-[0.28em] text-cream-500 uppercase">
            How every episode is made
          </h2>
          <div className="h-px flex-1 bg-cream-50/8" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {CRAFT_STEPS.map((step) => (
            <div
              key={step.n}
              className="group rounded-2xl border border-cream-50/7 bg-cream-50/[0.02] p-5 transition-colors duration-300 hover:border-ember-500/25 hover:bg-ember-500/[0.04]"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="font-display text-[1.6rem] font-light text-cream-600 italic transition-colors group-hover:text-ember-400">
                  {step.n}
                </span>
                <step.icon size={17} className="text-cream-500 transition-colors group-hover:text-ember-300" />
              </div>
              <h3 className="mb-1.5 font-display text-[1.15rem] font-medium text-cream-50">{step.title}</h3>
              <p className="text-[0.84rem] leading-relaxed text-cream-400">{step.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
