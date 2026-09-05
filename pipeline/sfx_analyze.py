"""Measure, trim and normalise the generated pool sound effects.

Usage: python pipeline/sfx_analyze.py [--write]
For each take in pipeline/sfx/raw: onset, length above -40 dB (T40), attack time, spectral centroid of the first
30 ms and of the tail, and an ASCII envelope. With --write, trims to [onset-2 ms, onset+T40+50 ms], applies a
short fade, peak-normalises and writes mono 16-bit WAVs to public/sfx/. Reference values for a real
phenolic ball click: T40 ≈ 20-60 ms, attack < 1 ms, centroid 4-8 kHz. The generator returns interleaved stereo.
"""
import os, sys, glob, wave, numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW, OUT, SR = os.path.join(ROOT, "pipeline", "sfx", "raw"), os.path.join(ROOT, "public", "sfx"), 44100

def load(path):
    with wave.open(path) as w: d = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768
    if len(d) % 2 == 0 and np.corrcoef(d[0::2], d[1::2])[0, 1] > np.corrcoef(d[:-1], d[1:])[0, 1]: d = (d[0::2] + d[1::2]) / 2   # stereo interleave
    return d[int(SR * 0.003):-int(SR * 0.003)]   # the generator leaves a click in the first and last millisecond

def centroid(x):
    if len(x) < 64: return 0.0
    X = np.abs(np.fft.rfft(x * np.hanning(len(x)))); f = np.fft.rfftfreq(len(x), 1 / SR)
    return float((X * f).sum() / (X.sum() + 1e-12))

def measure(d, block=int(SR * 0.001)):
    n = len(d) // block * block; env = np.sqrt((d[:n].reshape(-1, block) ** 2).mean(1)); db = 20 * np.log10(env + 1e-9)
    peak_i = int(db.argmax()); peak = db[peak_i]
    onset = int(np.argmax(db > peak - 30))                                                  # first ms within 30 dB of the peak
    below = np.where(db[peak_i:] < peak - 40)[0]; end = peak_i + (int(below[0]) if len(below) else len(db) - peak_i)
    attack_ms = peak_i - onset
    return dict(peak_db=float(peak), onset_ms=onset, attack_ms=attack_ms, t40_ms=end - onset,
                c_head=centroid(d[onset * block:(onset + 30) * block]), c_tail=centroid(d[(onset + 30) * block:end * block]),
                env=db, onset_i=onset * block, end_i=end * block, total_s=len(d) / SR)

def ascii_env(db, onset, width=60, span_ms=400):
    seg = db[onset:onset + span_ms]; step = max(1, len(seg) // width)
    return "".join(" .:-=+*#%@"[min(9, max(0, int((v + 60) / 6)))] for v in seg[::step][:width])

SINGLE_HIT = ("ballBall", "cushion", "cueTip")
def reject(name, m):
    if m["peak_db"] < -28: return "too quiet (noise floor would come up with it)"
    if name.startswith(SINGLE_HIT) and m["attack_ms"] > 60: return "double hit (peak long after onset)"
    return None

def main(write):
    if write: os.makedirs(OUT, exist_ok=True)
    manifest = {}
    print(f"{'take':18} {'peak':>6} {'attack':>7} {'T40':>6} {'c.head':>7} {'c.tail':>7}  envelope (400 ms from onset, 6 dB/char)")
    for path in sorted(glob.glob(os.path.join(RAW, "*.wav"))):
        name = os.path.basename(path)[:-4]; d = load(path); m = measure(d)
        why = reject(name, m)
        print(f"{name:18} {m['peak_db']:6.1f} {m['attack_ms']:6d}ms {m['t40_ms']:5d}ms {m['c_head']:6.0f}Hz {m['c_tail']:6.0f}Hz  {ascii_env(m['env'], m['onset_ms'])}" + (f"  REJECT: {why}" if why else ""))
        if not write or why: continue
        manifest.setdefault(name.rsplit("_", 1)[0], []).append(name + ".wav")
        a, b = max(0, m["onset_i"] - int(SR * 0.002)), min(len(d), m["end_i"] + int(SR * 0.05)); out = d[a:b].copy()
        fade = min(len(out) // 4, int(SR * 0.02)); out[-fade:] *= np.linspace(1, 0, fade); out[:int(SR * 0.001)] *= np.linspace(0, 1, int(SR * 0.001))
        out = out / (np.abs(out).max() + 1e-9) * 0.9
        with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out * 32767).astype("<i2").tobytes())
    if write:
        import json; json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=1); print("manifest:", {k: len(v) for k, v in manifest.items()})

if __name__ == "__main__": main("--write" in sys.argv)
