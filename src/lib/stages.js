/**
 * The generation pipeline as the UI understands it.
 * Keys mirror the backend job statuses exactly; weights approximate how long
 * each stage takes so the progress bar feels honest instead of linear.
 */

export const STAGES = [
  {
    key: 'queued',
    label: 'Warming up the studio',
    blurb: 'Spinning up your production and naming the episode.',
    weight: 3,
  },
  {
    key: 'discovering_sources',
    label: 'Scouting the best shows',
    blurb: 'Searching thousands of podcasts for the sharpest voices on your topic.',
    weight: 9,
  },
  {
    key: 'downloading_transcribing',
    label: 'Pulling episodes & transcribing',
    blurb: 'Downloading full episodes and turning every word into timestamped text.',
    weight: 42,
  },
  {
    key: 'extracting_clips',
    label: 'Clipping the sharpest minutes',
    blurb: 'Finding the moments where each expert is actually making their point.',
    weight: 22,
  },
  {
    key: 'building_curriculum',
    label: 'Ordering the story',
    blurb: 'Arranging clips like a great lecture — foundations first, nuance last.',
    weight: 8,
  },
  {
    key: 'writing_narration',
    label: 'Writing your narrator',
    blurb: 'Scripting warm, NPR-style transitions between every clip.',
    weight: 7,
  },
  {
    key: 'stitching',
    label: 'Mixing the final cut',
    blurb: 'Recording narration and stitching everything into one seamless episode.',
    weight: 9,
  },
];

const CUMULATIVE = (() => {
  const total = STAGES.reduce((sum, s) => sum + s.weight, 0);
  let acc = 0;
  return STAGES.map((s) => {
    acc += s.weight;
    return acc / total;
  });
})();

export function stageIndex(status) {
  return STAGES.findIndex((s) => s.key === status);
}

/** Progress ceiling (0–1) once a given stage has completed. */
export function progressCeiling(status) {
  const idx = stageIndex(status);
  if (idx < 0) return 0.02;
  return CUMULATIVE[idx];
}

/** Progress floor (0–1) when a given stage begins. */
export function progressFloor(status) {
  const idx = stageIndex(status);
  if (idx <= 0) return 0;
  return CUMULATIVE[idx - 1];
}

export const ETA_BY_DEPTH = {
  quick: '3–6 min',
  standard: '5–10 min',
  deep: '10–20 min',
};

export const DEPTHS = [
  {
    value: 'quick',
    label: 'Quick',
    tagline: 'A tight briefing',
    sources: 2,
    listen: '~10 min listen',
  },
  {
    value: 'standard',
    label: 'Standard',
    tagline: 'The full picture',
    sources: 3,
    listen: '~25 min listen',
  },
  {
    value: 'deep',
    label: 'Deep dive',
    tagline: 'Leave an expert',
    sources: 5,
    listen: '~50 min listen',
  },
];
