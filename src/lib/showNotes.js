// Turn a finished Poddy (title + chapters) into shareable, readable artifacts:
// Markdown show notes for export, and a compact plain-text blurb for sharing.

function fmtClock(ms) {
  if (!ms || isNaN(ms)) return '0:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
}

export function buildShowNotesMarkdown({ title, topic, chapters = [], sourcesUsed = [], totalMs = 0 }) {
  const lines = [];
  lines.push(`# ${title || topic}`);
  if (title && topic && title !== topic) lines.push(`*${topic}*`);
  lines.push('');

  const meta = [];
  if (sourcesUsed.length) meta.push(`${sourcesUsed.length} sources`);
  if (totalMs) meta.push(fmtClock(totalMs));
  if (meta.length) lines.push(meta.join(' · '));
  lines.push('');
  lines.push('Curated by Poddy from the world\'s best podcast conversations.');
  lines.push('');

  if (sourcesUsed.length) {
    lines.push('## Sources');
    sourcesUsed.forEach((s) => lines.push(`- ${s}`));
    lines.push('');
  }

  lines.push('## Chapters');
  chapters.forEach((ch) => {
    const stamp = fmtClock(ch.start_ms);
    if (ch.type === 'clip') {
      lines.push(`### [${stamp}] ${ch.title}`);
      if (ch.summary) lines.push(ch.summary);
      const src = [];
      if (ch.source_podcast) src.push(ch.source_podcast);
      if (ch.source_episode) src.push(`*${ch.source_episode}*`);
      if (src.length) lines.push(`— ${src.join(' — ')}`);
      if (ch.apple_podcasts_url) lines.push(`[Listen to the original episode](${ch.apple_podcasts_url})`);
    } else {
      lines.push(`### [${stamp}] ${ch.title}`);
      if (ch.text) lines.push(`> ${ch.text}`);
    }
    lines.push('');
  });

  return lines.join('\n').trim() + '\n';
}

export function buildShareText({ title, topic, sourcesUsed = [], totalMs = 0 }) {
  const bits = [`🎧 I made "${title || topic}" with Poddy`];
  const meta = [];
  if (sourcesUsed.length) meta.push(`${sourcesUsed.length} podcast sources`);
  if (totalMs) meta.push(fmtClock(totalMs));
  if (meta.length) bits.push(meta.join(' · '));
  bits.push('AI-curated audio documentaries from the best podcasts.');
  return bits.join('\n');
}

export function slugify(str) {
  return (str || 'poddy')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'poddy';
}
