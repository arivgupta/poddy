"""
Pedagogy — turn an ordered list of clips into a *teacher script* that makes the
result genuinely good learning material, not just a clip reel.

Grounded in the Cognitive Theory of Multimedia Learning (Mayer):
  * SEGMENTING: the lesson is already chunked into clips; the teacher pauses and
    signposts between them so the learner can process each chunk.
  * PRE-TRAINING: the intro names the key terms/ideas before the first clip.
  * SIGNALING: each clip gets a spoken label + on-screen lower-third naming the
    SOURCE (also our attribution requirement) and the concept.
  * GENERATIVE PROCESSING: we insert retrieval "checkpoints" (a question to
    answer in your head) and a recap before the takeaways.
  * PERSONALIZATION: warm, conversational, second-person voice.

This mirrors llm_curator.write_transitions_batch but adds checkpoints/recap and a
"learning path" of follow-up forks (ties into the audio side's extend idea).

Output is a flat ordered list of "beats":
  {type: "narration", role: "intro|bridge|checkpoint|recap|outro", text, on_screen}
  {type: "clip", ...clip fields...}
"""
from __future__ import annotations

from typing import List, Dict
import json
import os


def _heuristic_script(topic: str, clips: List[Dict], kids: bool) -> Dict:
    """Deterministic teacher script for offline runs."""
    tone = "Hi explorer!" if kids else "Welcome."
    intro = (f"{tone} Today we're learning about {topic}. "
             f"We'll watch {len(clips)} short clips from different teachers, and I'll "
             f"help connect the ideas. Let's begin.")
    bridges, checkpoints = [], []
    for i, c in enumerate(clips):
        title = c.get("chapter_title", f"part {i + 1}")
        src = c.get("source_uploader") or c.get("source_title") or "our next source"
        bridges.append(
            f"Next, here's {src} on '{title}'. "
            + ("Watch closely!" if kids else "Pay attention to how this builds on what we just saw.")
        )
        # A retrieval checkpoint after roughly every 2nd clip.
        if i > 0 and i % 2 == 0:
            checkpoints.append(f"Quick check: can you explain '{clips[i - 1].get('chapter_title', 'that idea')}' in your own words? Pause and try.")
        else:
            checkpoints.append("")
    recap = ("Let's recap the big ideas: "
             + "; ".join(c.get("chapter_title", "") for c in clips) + ".")
    outro = ("That's our lesson! "
             + ("Great job, explorer!" if kids else "")
             + " To go deeper next, you could branch into a follow-up lesson on any "
               "of the ideas we touched on.")
    return {"intro": intro, "bridges": bridges, "checkpoints": checkpoints,
            "recap": recap, "outro": outro,
            "learning_path": [c.get("chapter_title", "") for c in clips]}


def _llm_script(topic: str, clips: List[Dict], kids: bool) -> Dict:
    from openai import OpenAI  # lazy
    client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"), max_retries=4, timeout=120.0)
    ctx = [{"position": i,
            "chapter_title": c.get("chapter_title", ""),
            "summary": c.get("summary", ""),
            "source": c.get("source_uploader") or c.get("source_title", "")}
           for i, c in enumerate(clips)]
    audience = ("a curious CHILD (ages ~7-11): simple words, warm, playful, concrete"
                if kids else "a motivated adult learner: clear, warm, NPR-like")
    prompt = f"""You are an expert AI teacher narrating a personalized video lesson on: "{topic}"
Audience: {audience}.

Write narration that makes this genuinely good learning material. Apply learning science:
- INTRO (~30s spoken): name the 2-3 key ideas up front (pre-training), set the goal.
- BRIDGE before each clip (10-20s): NAME THE SOURCE explicitly (attribution + signaling), and connect it to the previous idea.
- CHECKPOINT after some clips (optional, "" if none): a short retrieval prompt the learner answers in their head.
- RECAP (~20s): restate the key ideas.
- OUTRO (~15s): takeaways + suggest 2-3 follow-up "learning path" forks to go deeper.

CLIPS (in order):
{json.dumps(ctx, indent=2)}

Return ONLY valid JSON:
{{"intro":"", "bridges":["per clip"], "checkpoints":["per clip, '' if none"], "recap":"", "outro":"", "learning_path":["fork 1","fork 2","fork 3"]}}"""
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are an eloquent AI teacher. Output only valid JSON."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.6,
    )
    return json.loads(resp.choices[0].message.content)


def build_lesson_plan(
    topic: str,
    ordered_clips: List[Dict],
    *,
    kids: bool = False,
    use_llm: bool = False,
) -> List[Dict]:
    """Weave narration beats and clips into a single ordered lesson plan.

    On-screen text is attached to each narration/clip beat for title cards and
    lower-thirds (rendered by cards.py).
    """
    if use_llm:
        try:
            s = _llm_script(topic, ordered_clips, kids)
        except Exception as e:  # noqa: BLE001
            print(f"  [pedagogy] LLM script failed ({e}); using heuristic")
            s = _heuristic_script(topic, ordered_clips, kids)
    else:
        s = _heuristic_script(topic, ordered_clips, kids)

    bridges = s.get("bridges", [])
    checkpoints = s.get("checkpoints", [])

    plan: List[Dict] = []
    plan.append({"type": "narration", "role": "intro", "text": s.get("intro", ""),
                 "on_screen": {"title": topic, "subtitle": "A Poddy video lesson"}})

    for i, clip in enumerate(ordered_clips):
        plan.append({
            "type": "narration", "role": "bridge",
            "text": bridges[i] if i < len(bridges) else "",
            "on_screen": {"title": clip.get("chapter_title", ""),
                          "subtitle": f"Source: {clip.get('source_uploader') or clip.get('source_title', '')}"},
        })
        plan.append({"type": "clip", **clip,
                     "lower_third": {
                         "line1": clip.get("source_uploader") or clip.get("source_title", ""),
                         "line2": clip.get("chapter_title", ""),
                         "license": clip.get("source_license", ""),
                     }})
        cp = checkpoints[i] if i < len(checkpoints) else ""
        if cp:
            plan.append({"type": "narration", "role": "checkpoint", "text": cp,
                         "on_screen": {"title": "Checkpoint", "subtitle": cp}})

    plan.append({"type": "narration", "role": "recap", "text": s.get("recap", ""),
                 "on_screen": {"title": "Recap", "subtitle": ""}})
    plan.append({"type": "narration", "role": "outro", "text": s.get("outro", ""),
                 "on_screen": {"title": "Takeaways", "subtitle": ""}})

    # Stash the learning-path forks on the intro beat for the UI/credits.
    if plan:
        plan[0]["learning_path"] = s.get("learning_path", [])
    return plan
