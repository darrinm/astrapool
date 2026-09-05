"""Generate the pool sound-effect library with ElevenLabs Sound Effects v2 on fal.

Usage: python pipeline/sfx.py [category ...]     (default: all)
Raw takes land in pipeline/sfx/raw/<category>_<n>.wav (44.1 kHz mono 16-bit). sfx_analyze.py then measures,
trims and normalises them into public/sfx/.
"""
import os, sys, wave, httpx, falenv, fal_client
OUT = os.path.join(falenv.ROOT, "pipeline", "sfx", "raw")
os.makedirs(OUT, exist_ok=True)

# One prompt per category, several takes each so repeated hits can vary. Short fixed durations keep the model
# from padding with room tone; "dry" and "single" steer it away from ambience and multi-hit loops.
LIB = {
    "ballBall_soft": ("two phenolic billiard balls touching gently, a single quiet dry click, close-miked, no reverb, no other sounds", 1.0, 4),
    "ballBall_hard": ("two phenolic billiard balls colliding hard, a single loud sharp dry click, close-miked, no reverb, no other sounds", 1.0, 4),
    "cushion": ("a billiard ball bouncing off the rubber cushion of a pool table, a single dull thud, dry, close-miked, no reverb", 1.0, 3),
    "cueTip": ("a leather cue tip striking a cue ball on a pool table, a single firm tock, dry, close-miked, no reverb", 1.0, 3),
    "pocket": ("a billiard ball dropping into a leather pool table pocket and landing, a single hollow wooden knock, dry, no reverb", 1.5, 3),
    "rattle": ("a billiard ball rattling between the jaws of a pool table pocket, two or three quick wooden taps, dry, no reverb", 1.0, 3),
}

def generate(name, prompt, seconds, takes):
    for i in range(takes):
        path = os.path.join(OUT, f"{name}_{i}.wav")
        if os.path.exists(path): print("have", path); continue
        args = {"text": prompt, "duration_seconds": seconds, "prompt_influence": 0.7, "output_format": "pcm_44100"}
        res = fal_client.subscribe("fal-ai/elevenlabs/sound-effects/v2", arguments=args)
        pcm = httpx.get(res["audio"]["url"], timeout=120).content
        with wave.open(path, "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(44100); w.writeframes(pcm)
        print("wrote", path, len(pcm) // 2 / 44100, "s")

if __name__ == "__main__":
    names = sys.argv[1:] or list(LIB)
    for n in names:
        prompt, seconds, takes = LIB[n]
        generate(n, prompt, seconds, takes)
