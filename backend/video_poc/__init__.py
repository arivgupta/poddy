"""
Poddy Video Learning — Proof of Concept (EXPERIMENTAL, NOT WIRED INTO THE APP).

This package is a self-contained skeleton that demonstrates the *architecture* of
turning a topic into a personalized educational VIDEO lesson stitched from real
source videos with an AI "teacher" that introduces and bridges the clips.

It is deliberately conservative:
  * The network/download step is GATED behind an explicit flag (default OFF) so it
    never scrapes at scale.
  * Every external dependency (yt-dlp, OpenAI, edge-tts) is imported lazily so the
    module is import-clean and `--help`-able on a bare machine.
  * The default CLI mode is a DRY RUN that prints the plan it WOULD execute
    (commands, segments, ordering) without touching the network.

See README.md and ../../docs/VIDEO_LEARNING_PIPELINE.md for the full design.
"""

__version__ = "0.0.1-poc"
