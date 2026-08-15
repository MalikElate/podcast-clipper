"""
Transcribes an audio file with word-level timestamps using faster-whisper
and prints the result to stdout as JSON. Invoked as a subprocess from the
Node backend (src/lib/whisper.js) so we get real per-word timing (faster
and more accurate for tight subtitle sync than estimating word timing from
phrase-level output).

Usage: python transcribe_whisper.py <audio_path>

Prints ONLY a JSON array to stdout:
    [{"word": "hello", "start": 0.12, "end": 0.34}, ...]
Any logging/progress output from faster-whisper goes to stderr so it never
pollutes stdout.
"""

import json
import os
import sys


def main():
    if len(sys.argv) < 2:
        print("Usage: transcribe_whisper.py <audio_path>", file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]
    model_size = os.environ.get("WHISPER_MODEL", "base")

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "faster-whisper is not installed. Run: pip install faster-whisper",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"[transcribe_whisper] Loading Whisper model '{model_size}'...", file=sys.stderr)
    model = WhisperModel(model_size, device="auto", compute_type="auto")

    segments, _info = model.transcribe(
        audio_path,
        word_timestamps=True,
        vad_filter=True,  # skip silence, improves accuracy on long podcasts
    )

    words = []
    for segment in segments:
        for word in segment.words:
            words.append(
                {
                    "word": word.word.strip(),
                    "start": round(word.start, 2),
                    "end": round(word.end, 2),
                }
            )

    if not words:
        print("[transcribe_whisper] Warning: no words transcribed.", file=sys.stderr)

    print(f"[transcribe_whisper] Transcribed {len(words)} words.", file=sys.stderr)
    # Only this line goes to stdout, so Node can JSON.parse it directly.
    print(json.dumps(words))


if __name__ == "__main__":
    main()
