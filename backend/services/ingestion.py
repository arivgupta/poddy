from typing import List, Dict, Optional, Any, Tuple
import os
import re
import json
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed


# ─────────────────────────────────────────────────────────────────────────────
# 1. PODCAST SEARCH  (iTunes Search API — completely free, no auth)
# ─────────────────────────────────────────────────────────────────────────────

def search_podcast(query: str, limit: int = 5) -> List[dict]:
    """Searches iTunes and returns podcasts with feed_url."""
    encoded = urllib.parse.quote(query)
    url = f"https://itunes.apple.com/search?term={encoded}&media=podcast&limit={limit}"
    with urllib.request.urlopen(url, timeout=10) as resp:
        data = json.loads(resp.read().decode())
    results = []
    for item in data.get("results", []):
        feed_url = item.get("feedUrl", "")
        if feed_url:
            results.append({
                "title": item.get("collectionName", ""),
                "author": item.get("artistName", ""),
                "feed_url": feed_url,
                "apple_podcasts_url": item.get("collectionViewUrl", ""),
            })
    return results


# ─────────────────────────────────────────────────────────────────────────────
# 2. EPISODE SELECTION  (RSS-based, keyword scored)
# ─────────────────────────────────────────────────────────────────────────────

def get_best_episode(feed_url: str, topic_hint: str = "", episode_title_hint: str = "") -> dict:
    """
    Parses an RSS feed and uses GPT-4o to pick the most relevant episode.
    Falls back to keyword matching if the LLM call fails.
    Returns: { title, mp3_url, apple_podcasts_url }
    """
    try:
        req = urllib.request.Request(feed_url, headers={"User-Agent": "Poddy/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read()
    except Exception as e:
        raise ValueError(f"Could not fetch RSS feed {feed_url}: {e}")

    root = ET.fromstring(raw)
    episodes = []

    channel_link = ""
    for link_el in root.iter("link"):
        if link_el.text and "apple" in link_el.text:
            channel_link = link_el.text
            break

    for item in root.iter("item"):
        title_el = item.find("title")
        enclosure_el = item.find("enclosure")
        link_el = item.find("link")

        if enclosure_el is None:
            continue
        mp3_url = enclosure_el.get("url", "")
        if not mp3_url:
            continue

        title = title_el.text.strip() if title_el is not None and title_el.text else ""
        ep_link = link_el.text.strip() if link_el is not None and link_el.text else channel_link
        episodes.append({"title": title, "mp3_url": mp3_url, "apple_podcasts_url": ep_link})

    if not episodes:
        raise ValueError(f"No audio episodes found in feed: {feed_url}")

    # Use GPT-4o to pick the best episode from the catalog
    try:
        best = _llm_pick_episode(episodes[:50], topic_hint, episode_title_hint)
        if best is not None:
            return best
    except Exception as e:
        print(f"  LLM episode selection failed, falling back to keyword match: {e}")

    # Fallback: keyword scoring
    combined_hint = f"{topic_hint} {episode_title_hint}".lower()
    keywords = set(re.sub(r"[^a-zA-Z0-9 ]", "", combined_hint).split())

    def score(ep):
        text = ep["title"].lower()
        return sum(1 for kw in keywords if kw in text)

    if keywords:
        best = max(episodes, key=score)
        if score(best) > 0:
            return best

    return episodes[0]


def _llm_pick_episode(episodes: list, topic: str, episode_hint: str) -> Optional[dict]:
    """Ask GPT-4o to pick the single best episode from a list of titles."""
    from openai import OpenAI
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

    titles = [f"{i}: {ep['title']}" for i, ep in enumerate(episodes)]
    titles_block = "\n".join(titles)

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You pick podcast episodes. Return only valid JSON."},
            {"role": "user", "content": f"""Pick the ONE episode most relevant to the topic below.

Topic: {topic}
Episode hint: {episode_hint}

EPISODES:
{titles_block}

Return ONLY: {{"index": 3, "reason": "one sentence"}}
If NONE are relevant, return: {{"index": -1, "reason": "why"}}"""}
        ],
        response_format={"type": "json_object"},
        temperature=0.1,
    )
    data = json.loads(response.choices[0].message.content)
    idx = data.get("index", -1)
    if 0 <= idx < len(episodes):
        print(f"  LLM picked episode [{idx}]: {episodes[idx]['title']} — {data.get('reason', '')}")
        return episodes[idx]
    return None


# ─────────────────────────────────────────────────────────────────────────────
# 3. DOWNLOAD  (direct urllib — no auth, no bot detection)
# ─────────────────────────────────────────────────────────────────────────────

def download_podcast_episode(mp3_url: str, output_path: str) -> str:
    """Downloads a podcast episode MP3 directly from the RSS enclosure URL."""
    print(f"  Downloading: {mp3_url[:80]}...")
    if os.path.exists(output_path):
        os.remove(output_path)

    request = urllib.request.Request(
        mp3_url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; Poddy Podcast Client)"}
    )
    with urllib.request.urlopen(request, timeout=90) as resp, open(output_path, "wb") as out:
        total = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        while True:
            buf = resp.read(512 * 1024)
            if not buf:
                break
            out.write(buf)
            downloaded += len(buf)
            if total:
                pct = downloaded / total * 100
                print(f"    {pct:.0f}% ({downloaded//1024//1024}MB)", end="\r")
    print(f"  Downloaded → {output_path}")
    return output_path


# ─────────────────────────────────────────────────────────────────────────────
# 4. TRIM  (keep first N minutes for Whisper's 25 MB limit)
# ─────────────────────────────────────────────────────────────────────────────

def trim_audio(input_path: str, max_minutes: int = 25) -> str:
    """Trims a podcast MP3 to max_minutes and re-encodes to 64kbps mono.
    Low bitrate keeps files under Whisper's 25MB limit and reduces memory during stitching.
    """
    import subprocess
    output_path = input_path.replace(".mp3", "_trim.mp3")
    if os.path.exists(output_path):
        os.remove(output_path)
    subprocess.run(
        ["ffmpeg", "-y", "-i", input_path, "-t", str(max_minutes * 60),
         "-ac", "1", "-ab", "64k", output_path],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
    )
    print(f"  Trimmed to {max_minutes}min → {output_path}")
    return output_path


# ─────────────────────────────────────────────────────────────────────────────
# 5. TRANSCRIBE  (OpenAI Whisper API with segment timestamps)
# ─────────────────────────────────────────────────────────────────────────────

def transcribe_audio(audio_path: str) -> str:
    """
    Sends audio to OpenAI Whisper and returns a timestamped transcript.
    Format:  "0.0s - 4.2s: Some words spoken here..."
    """
    from openai import OpenAI
    api_key = os.environ.get("OPENAI_API_KEY")
    client = OpenAI(api_key=api_key)
    print(f"  Transcribing {audio_path} with Whisper...")

    with open(audio_path, "rb") as f:
        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["segment"],
        )

    lines = []
    for seg in response.segments:
        lines.append(f"{round(seg.start, 2)}s - {round(seg.end, 2)}s: {seg.text.strip()}")
    full_text = "\n".join(lines)
    print(f"  Transcript ready: {len(full_text)} chars")
    # Cap at 8000 chars for LLM context efficiency
    return full_text[:8000]


# ─────────────────────────────────────────────────────────────────────────────
# 6. PARALLEL MULTI-SOURCE PIPELINE
# ─────────────────────────────────────────────────────────────────────────────

def process_source(source: dict, job_dir: str) -> Optional[dict]:
    """
    Full pipeline for a single source: find podcast → find episode → download → trim → transcribe.
    Returns the source dict enriched with: transcript, resolved_episode_title, audio_path, apple_podcasts_url
    """
    podcast_name = source.get("podcast_name", "")
    episode_hint = source.get("episode_title_hint", "")
    topic_hint   = source.get("unique_angle", podcast_name)

    print(f"\n[{podcast_name}] Searching iTunes...")
    try:
        podcasts = search_podcast(podcast_name, limit=3)
        if not podcasts:
            print(f"[{podcast_name}] Not found on iTunes — skipping.")
            return None
        podcast = podcasts[0]

        print(f"[{podcast_name}] Found feed. Selecting episode matching: '{episode_hint}'")
        episode = get_best_episode(podcast["feed_url"], topic_hint=topic_hint, episode_title_hint=episode_hint)
        print(f"[{podcast_name}] Episode: {episode['title']}")

        safe_name = re.sub(r"[^a-zA-Z0-9]", "_", podcast_name)[:30]
        raw_path  = os.path.join(job_dir, f"{safe_name}_raw.mp3")
        trim_path = raw_path.replace(".mp3", "_trim.mp3")  # Huberman_Lab_raw_trim.mp3

        download_podcast_episode(episode["mp3_url"], raw_path)
        trim_audio(raw_path, max_minutes=25)
        # Free disk: raw file is no longer needed after trimming
        if os.path.exists(raw_path):
            os.remove(raw_path)
        transcript = transcribe_audio(trim_path)

        return {
            **source,
            "transcript":              transcript,
            "audio_path":              trim_path,
            "resolved_episode_title":  episode["title"],
            "apple_podcasts_url":      episode.get("apple_podcasts_url", podcast.get("apple_podcasts_url", "")),
        }
    except Exception as e:
        print(f"[{podcast_name}] ERROR during processing: {e}")
        return None


def process_sources_parallel(sources: List[dict], job_dir: str) -> List[dict]:
    """Process multiple podcast sources in parallel (IO-bound, so threads are ideal)."""
    results = []
    max_workers = min(len(sources), 2)  # cap at 2 to limit memory on Railway
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(process_source, s, job_dir): s for s in sources}
        for future in as_completed(futures):
            result = future.result()
            if result:
                results.append(result)
    return results
