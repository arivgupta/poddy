"""
Topic-grounded podcast discovery.

The original discovery path asks an LLM to *recall* the best podcast shows from
memory, then tries to find an on-topic episode inside each show's recent RSS
feed. That has two failure modes we saw in live testing:
  1. the recalled show is right but its *recent feed* has no on-topic episode, so
     the pipeline forces the latest (off-topic) episode — wasting a Whisper
     transcription and polluting the documentary, and
  2. a recalled show name doesn't resolve cleanly on iTunes.

This module grounds discovery in reality instead: it searches the **iTunes
Search API at the episode level** (`entity=podcastEpisode`) for the topic, which
returns *real, existing episodes* (with direct MP3 enclosure URLs), then asks the
LLM to **rank those real episodes** for credibility, on-topic depth, and source
diversity — dropping sleep-aid/ASMR/content-farm filler. Because each candidate
already carries its MP3 URL + GUID, the heavy per-feed episode-selection step is
skipped entirely for grounded candidates.

If the grounded pool comes back empty (very rare / niche topics), callers fall
back to the legacy `curate_sources` recall path.
"""
from typing import List, Dict, Optional
import os
import re
import json
import urllib.request
import urllib.parse

from services.ingestion import _clean_text


_ITUNES_EP = "https://itunes.apple.com/search"


def _itunes_episode_search(term: str, limit: int = 25) -> List[dict]:
    """Search iTunes at the episode level and normalize the useful fields."""
    params = urllib.parse.urlencode({
        "term": term,
        "media": "podcast",
        "entity": "podcastEpisode",
        "limit": limit,
    })
    url = f"{_ITUNES_EP}?{params}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Poddy/1.0"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            data = json.loads(resp.read().decode())
    except Exception as e:
        print(f"  iTunes episode search failed for {term!r}: {e}")
        return []

    out: List[dict] = []
    for r in data.get("results", []):
        mp3 = r.get("episodeUrl") or ""
        if not mp3:
            continue
        out.append({
            "podcast_name": (r.get("collectionName") or "").strip(),
            "episode_title_hint": (r.get("trackName") or "").strip(),
            "resolved_episode_title": (r.get("trackName") or "").strip(),
            "mp3_url": mp3,
            "apple_podcasts_url": r.get("trackViewUrl") or r.get("collectionViewUrl") or "",
            "guid": str(r.get("trackId") or mp3),
            "description": _clean_text(r.get("description") or r.get("shortDescription") or "")[:400],
            "release_date": r.get("releaseDate", ""),
            "unique_angle": "",
        })
    return out


def _generate_search_queries(topic: str) -> List[str]:
    """Ask a cheap model for a few episode-search queries; fall back to the raw topic.

    Episode search matches on episode/show text, so a couple of focused keyword
    queries widen and sharpen the candidate pool versus a single long sentence.
    """
    queries: List[str] = [topic.strip()]
    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"), max_retries=3, timeout=30.0)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.4,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You generate podcast search queries. Output only valid JSON."},
                {"role": "user", "content": (
                    f'Topic: "{topic}"\n\n'
                    "Give 3 short search queries (2-5 words each) that would surface the best, most "
                    "credible podcast EPISODES on this topic in a podcast search engine. Vary the angle "
                    "(e.g. mechanism, expert name, practical angle). No punctuation.\n\n"
                    'Return: {"queries": ["...", "...", "..."]}'
                )},
            ],
        )
        data = json.loads(resp.choices[0].message.content)
        for q in data.get("queries", []):
            q = (q or "").strip()
            if q and q.lower() not in {x.lower() for x in queries}:
                queries.append(q)
    except Exception as e:
        print(f"  Search-query generation failed, using raw topic: {e}")
    return queries[:4]


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def search_episode_pool(topic: str, per_query: int = 25) -> List[dict]:
    """Build a de-duplicated pool of real, topic-matched episodes."""
    pool: List[dict] = []
    seen_mp3 = set()
    for q in _generate_search_queries(topic):
        for ep in _itunes_episode_search(q, limit=per_query):
            key = ep["mp3_url"]
            if key in seen_mp3:
                continue
            seen_mp3.add(key)
            pool.append(ep)
    return pool


def _rank_episodes(topic: str, pool: List[dict], n_total: int) -> List[dict]:
    """Ask the LLM to pick the best, most credible, source-diverse real episodes."""
    if not pool:
        return []

    listing = []
    for i, ep in enumerate(pool):
        desc = ep.get("description", "")
        line = f"{i}: \"{ep['episode_title_hint']}\" — {ep['podcast_name']}"
        if desc:
            line += f"\n    {desc[:220]}"
        listing.append(line)
    listing_block = "\n".join(listing)

    prompt = f"""You are a world-class podcast research librarian building a multi-source audio documentary on:
"{topic}"

Below are REAL podcast episodes (already verified to exist) returned by a podcast search engine. Pick the best {n_total} episodes, ranked best-first.

RULES:
- ON-TOPIC: the episode must genuinely cover "{topic}" in substance — not just mention it in passing.
- CREDIBLE: prefer episodes from reputable shows with real expertise (scientists, journalists, practitioners, respected interview shows). 
- REJECT filler: sleep-aid / ASMR / "facts to fall asleep to" / meditation / affirmation / manifestation / generic content-farm episodes, UNLESS the topic itself is explicitly about those.
- DIVERSITY: never pick two episodes from the SAME show — every pick must be a different podcast. Favor a mix of perspectives.
- If fewer than {n_total} are genuinely good, return only the good ones (do not pad with junk).

EPISODES:
{listing_block}

Return ONLY valid JSON:
{{"selected": [{{"index": 0, "reason": "one sentence"}}]}}"""

    try:
        from openai import OpenAI
        client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"), max_retries=4, timeout=60.0)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You curate podcast episodes for credibility and relevance. Output only valid JSON."},
                {"role": "user", "content": prompt},
            ],
        )
        data = json.loads(resp.choices[0].message.content)
    except Exception as e:
        print(f"  Episode ranking failed ({e}); using raw search order")
        data = {"selected": [{"index": i} for i in range(len(pool))]}

    chosen: List[dict] = []
    used_shows = set()
    for item in data.get("selected", []):
        idx = item.get("index")
        if not isinstance(idx, int) or not (0 <= idx < len(pool)):
            continue
        ep = pool[idx]
        show_key = _norm(ep["podcast_name"])
        if show_key and show_key in used_shows:
            continue  # enforce one-episode-per-show even if the model slips
        used_shows.add(show_key)
        reason = item.get("reason", "")
        if reason:
            ep = {**ep, "unique_angle": reason}
        chosen.append(ep)
    return chosen


def discover_episode_candidates(topic: str, n_sources: int, n_extra: int = 4) -> List[dict]:
    """
    Return a ranked list of REAL, topic-matched episode candidates (each with a
    direct mp3_url + guid), over-provisioned with backups for backfill. Empty if
    the grounded search turned up nothing usable (callers should then fall back
    to the legacy recall path).
    """
    pool = search_episode_pool(topic)
    print(f"Grounded discovery: {len(pool)} real episodes found for {topic!r}")
    if not pool:
        return []
    total = n_sources + max(0, n_extra)
    ranked = _rank_episodes(topic, pool, n_total=total)
    print(f"Grounded discovery: ranked {len(ranked)} credible candidates: "
          f"{[c['podcast_name'] for c in ranked]}")
    return ranked
