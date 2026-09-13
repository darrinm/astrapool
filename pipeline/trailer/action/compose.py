"""Action trailer editor. Original 150 BPM score and synchronized in-game impacts."""

from pathlib import Path
import argparse, json, math, shutil, subprocess, wave
import numpy as np

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "render"
OUT.mkdir(exist_ok=True)
parser = argparse.ArgumentParser(description=__doc__)
inputs = parser.add_mutually_exclusive_group()
inputs.add_argument(
    "--footage",
    type=Path,
    help="Clean video master (defaults to the committed footage)",
)
inputs.add_argument(
    "--frames", type=Path, help="Fresh JPEG frame directory, e.g. action/render/frames"
)
parser.add_argument("--manifest", type=Path, help="Matching shot/sound manifest")
parser.add_argument("--output", type=Path, default=OUT / "astra-pool-trailer.mp4")
parser.add_argument("--sans-font", default="Arial")
parser.add_argument("--display-font", default="Arial Black")
parser.add_argument("--serif-font", default="Baskerville")
args = parser.parse_args()
if not shutil.which("ffmpeg"):
    parser.error("FFmpeg is required (with libx264, AAC and libass support).")
manifest = args.manifest or (
    args.frames.parent / "capture.json"
    if args.frames
    else ROOT / "capture-manifest.json"
)
if not manifest.is_file():
    parser.error(f"Missing capture manifest: {manifest}")
meta = json.loads(manifest.read_text())
DUR = meta["duration"]
SR = 48000
footage = (args.footage or ROOT.parent / "astra-pool-footage.mp4").resolve()
if not args.frames and not footage.is_file():
    parser.error(f"Missing footage: {footage}")
if args.frames:
    missing = [
        i for i in range(meta["frames"]) if not (args.frames / f"{i:05d}.jpg").is_file()
    ]
    if missing:
        parser.error(
            f"Missing {len(missing)} frames; first missing frame: {missing[0]}"
        )
args.output = args.output.resolve()
args.output.parent.mkdir(parents=True, exist_ok=True)
video_input = (
    ["-framerate", str(meta["fps"]), "-i", str(args.frames.resolve() / "%05d.jpg")]
    if args.frames
    else ["-i", str(footage)]
)
rng = np.random.default_rng(814)
audio = np.zeros((round(SR * DUR), 2), np.float64)


def add(s, start, level=1, pan=0):
    i = round(start * SR)
    if i < 0 or i >= len(audio):
        return
    s = np.asarray(s)[: len(audio) - i] * level
    if s.ndim == 1:
        s = np.column_stack((s * np.sqrt((1 - pan) / 2), s * np.sqrt((1 + pan) / 2)))
    audio[i : i + len(s)] += s


def tone(midi, dur, kind="pluck"):
    t = np.arange(round(dur * SR)) / SR
    f = 440 * 2 ** ((midi - 69) / 12)
    if kind == "bass":
        y = sum(np.sin(2 * np.pi * f * k * t) / k**1.5 for k in range(1, 7))
        env = (
            np.minimum(t / 0.006, 1) * np.exp(-t * 5) * np.minimum((dur - t) / 0.03, 1)
        )
    elif kind == "pad":
        y = (np.sin(2 * np.pi * f * t) + np.sin(2 * np.pi * f * 1.003 * t + 0.8)) / 2
        env = np.minimum(t / 0.25, 1) * np.minimum((dur - t) / 0.8, 1)
    else:
        y = (
            np.sin(2 * np.pi * f * t)
            + 0.35 * np.sin(2 * np.pi * f * 2 * t)
            + 0.12 * np.sin(2 * np.pi * f * 3 * t)
        )
        env = (
            np.minimum(t / 0.002, 1) * np.exp(-t * 9) * np.minimum((dur - t) / 0.03, 1)
        )
    return y * np.maximum(0, env)


# Driving D-minor bass ostinato, with air around the computer search.
roots = [38, 38, 34, 36]
beat = 0.4
for i, start in enumerate(np.arange(0, 45, beat)):
    root = roots[int(start // 3.2) % 4]
    if 7 < start < 10.8:
        level = 0.13
    elif 29 <= start < 35:
        level = 0.2
    else:
        level = 0.26
    add(tone(root + (12 if i % 8 == 6 else 0), 0.38, "bass"), float(start), level)
    if i % 2 == 0:
        add(tone(root + 12, 0.2, "bass"), float(start + 0.2), level * 0.5, 0.2)
    t = np.arange(int(0.33 * SR)) / SR
    kick = np.sin(2 * np.pi * (48 * t + 8 * (1 - np.exp(-t * 45)))) * np.exp(-t * 15)
    if not (7.1 < start < 10):
        add(kick, float(start), 0.48)
    if i % 2 == 1:
        t = np.arange(int(0.15 * SR)) / SR
        n = rng.normal(size=len(t))
        clap = (n - np.roll(n, 1)) * 0.4 * np.exp(-t * 30) + 0.2 * np.sin(
            2 * np.pi * 185 * t
        ) * np.exp(-t * 28)
        add(clap, float(start), 0.18)
for i, start in enumerate(np.arange(0.2, 44.9, 0.2)):
    t = np.arange(int(0.06 * SR)) / SR
    n = rng.normal(size=len(t))
    hat = (n - np.roll(n, 1)) * np.exp(-t * 85)
    add(hat, float(start), 0.033 if i % 2 == 0 else 0.019, 0.55 if i % 2 else -0.55)
notes = [74, 77, 81, 86, 81, 77, 72, 77, 81, 84, 81, 77, 70, 74, 77, 82]
for i, start in enumerate(np.arange(2, 45, 0.2)):
    n = notes[i % len(notes)]
    s = tone(n, 0.65)
    lev = 0.06 if 7 <= start < 11 or 29 <= start < 35 else 0.1
    add(s, float(start), lev, 0.5 if i % 2 else -0.5)
    add(s, float(start + 0.3), lev * 0.22, -0.5 if i % 2 else 0.5)
for j, start in enumerate(np.arange(0, 48, 3.2)):
    for k, n in enumerate(
        [[50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 64], [50, 57, 62, 69]][j % 4]
    ):
        add(tone(n, 4, "pad"), float(start), 0.07, (-0.6 + k * 0.4))
# Cinematic cut accents and short reverse air transitions.
for start in [
    0,
    0.6,
    1.2,
    2,
    2.6,
    3.8,
    5,
    6,
    7,
    11,
    12.4,
    14,
    16,
    17.5,
    19.9,
    22,
    23,
    24.5,
    26,
    29,
    32,
    35,
    36,
    37,
    38,
    40,
    42,
    42.6,
    43.8,
    45,
]:
    t = np.arange(int(0.16 * SR)) / SR
    n = rng.normal(size=len(t))
    low = np.convolve(n, np.ones(31) / 31, mode="same")
    add(low * np.exp(-t * 24), start, 0.18)
for stop in [7, 11, 16, 22, 29, 32, 35, 38, 42, 45]:
    dur = 0.42
    t = np.arange(int(dur * SR)) / SR
    n = rng.normal(size=len(t))
    n = np.convolve(n, np.ones(25) / 25, mode="same")
    add(n * (t / dur) ** 2, stop - dur, 0.32)
# Exact sound-event times captured from the renderer, including the slow-motion cuts.
cache = {}
counts = {}
for e in meta["sounds"]:
    method = e["method"]
    event_args = e["args"]
    start = e["time"]
    if method == "arcade":
        if isinstance(event_args[0], str) and (
            "pot" in event_args[0] or "bank" in event_args[0]
        ):
            for n, offset in [(74, 0), (81, 0.075), (86, 0.15)]:
                add(tone(n, 0.4), start + offset, 0.08)
        continue
    strength = max(0.05, min(1.4, float(event_args[0])))
    pan = max(-0.85, min(0.85, float(event_args[1] if len(event_args) > 1 else 0)))
    files = {
        "cueTip": ["cueTip_1.wav", "cueTip_2.wav"],
        "ballBall": [
            "ballBall_hard_0.wav",
            "ballBall_hard_2.wav",
            "ballBall_soft_0.wav",
        ],
        "cushion": ["cushion_0.wav", "cushion_1.wav"],
        "pocket": ["pocket_0.wav", "pocket_1.wav"],
        "rattle": ["rattle_0.wav", "rattle_1.wav"],
    }
    names = files.get(method)
    if not names:
        continue
    count = counts.get(method, 0)
    counts[method] = count + 1
    name = names[count % len(names)]
    if name not in cache:
        raw = subprocess.check_output(
            [
                "ffmpeg",
                "-v",
                "error",
                "-i",
                str(ROOT.parents[2] / "public/sfx" / name),
                "-f",
                "f32le",
                "-ac",
                "1",
                "-ar",
                str(SR),
                "-",
            ]
        )
        cache[name] = np.frombuffer(raw, dtype=np.float32)
    add(
        cache[name],
        start,
        (0.55 if method == "cueTip" else 0.4) * math.sqrt(strength),
        pan,
    )
# Final impact and four-second resolving chord.
t = np.arange(int(0.7 * SR)) / SR
add(np.sin(2 * np.pi * (42 * t + 6 * (1 - np.exp(-t * 25)))) * np.exp(-t * 6), 45, 0.6)
for n in [38, 50, 57, 62, 65, 69]:
    add(tone(n, 4, "pad"), 45, 0.13)
dry = audio.copy()
for delay, lev in [(0.12, 0.055), (0.24, 0.035), (0.36, 0.02)]:
    d = int(delay * SR)
    audio[d:] += dry[:-d, ::-1] * lev
fade = np.ones(len(audio))
fade[:2400] = np.linspace(0, 1, 2400)
fade[-48000:] = np.linspace(1, 0, 48000)
audio *= fade[:, None]
audio = np.tanh(audio * 0.9)
audio *= 0.9 / max(0.9, np.abs(audio).max())
with wave.open(str(OUT / "soundtrack.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((audio * 32767).astype("<i2").tobytes())
# Bold kinetic typography. Search bubbles and phone UI are already captured in the footage.
header = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,Arial Black,88,&H00F1F7FF,&H00F1F7FF,&HAA0D0A05,&H88000000,-1,0,0,0,100,100,0,0,1,2,2,7,90,90,70,1
Style: Small,Arial,27,&H00F0E393,&H00F0E393,&HAA0D0A05,&H88000000,-1,0,0,0,100,100,2,0,1,1,1,7,90,90,70,1
Style: Brand,Baskerville,150,&H00F1F7FF,&H00F1F7FF,&HAA0D0A05,&H88000000,0,0,0,0,100,100,0,0,1,1,2,5,90,90,70,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def stamp(s):
    return f"{int(s)//3600}:{int(s)//60%60:02d}:{s%60:05.2f}"


lines = []


def title(
    start, end, text, style="Main", x=90, y=75, size=None, center=False, fade=100
):
    tag = f"\\an{5 if center else 7}\\pos({x},{y})\\fad({fade},{fade})"
    if size:
        tag += f"\\fs{size}"
    if style == "Main":
        tag += "\\fscx112\\fscy112\\t(0,150,\\fscx100\\fscy100)"
    lines.append(
        f"Dialogue: 1,{stamp(start)},{stamp(end)},{style},,0,0,0,,{{{tag}}}{text}"
    )


title(0.03, 0.56, "RACK.", x=90, y=800, size=124, fade=35)
title(0.64, 1.16, "BREAK.", x=90, y=800, size=124, fade=35)
title(1.24, 1.95, "REPEAT.", x=90, y=800, size=124, fade=35)
title(3.9, 6.9, "YOU VS. A FRIEND.", x=90, y=825, size=82)
title(4.05, 6.9, "LOCAL OR ONLINE", style="Small", y=946)
title(7.12, 10.6, "YOU VS. SHOW-OFF AI.", size=72)
title(7.15, 10.6, "TRICKY COMPUTER  /  REAL SHOT SEARCH", style="Small", y=170)
title(11.25, 13.5, "PLAY THE ANGLES.", size=69, y=835)
title(11.3, 13.5, "BANK SHOT  /  COMPUTER-SELECTED", style="Small", y=946)
title(16.1, 17.45, "THINK AGAIN.", size=74)
title(18.4, 21.8, "MAKE IT A TRICK SHOT.", size=62, y=840)
title(22.1, 22.94, "FIND ANOTHER WAY.", size=70)
title(23.2, 25.8, "KICK. BANK. SINK.", size=70, y=842)
title(35.05, 36.05, "YOU VS…", size=82, y=825, fade=50)
title(36.05, 37.95, "YOU VS… YOURSELF!", size=82, y=825, fade=50)
title(36.15, 37.95, "FREE PLAY  /  CHASE YOUR OWN BEST", style="Small", y=946)
title(38.1, 39.8, "BEND THE GAME.", size=78, y=825)
title(38.2, 39.8, "OPTIONAL BLACK HOLE GRAVITY", style="Small", y=946)
title(42.1, 44.85, "YOUR SHOT.", x=90, y=830, size=94)
title(45.15, 48.8, "Astra Pool", style="Brand", x=960, y=330, center=True)
title(45.45, 48.8, "PLAY NOW", style="Small", x=960, y=482, size=32, center=True)
title(
    45.7,
    48.8,
    "astrapool.darrinm.com",
    style="Main",
    x=960,
    y=566,
    size=59,
    center=True,
)
title(
    45.8, 48.8, "FREE AND OPEN SOURCE", style="Main", x=960, y=698, size=38, center=True
)
title(
    45.9,
    48.8,
    "github.com/darrinm/astrapool",
    style="Small",
    x=960,
    y=766,
    size=32,
    center=True,
)
title(
    46,
    48.8,
    "DESKTOP + MOBILE  /  NO INSTALL. NO ACCOUNT.",
    style="Small",
    x=960,
    y=883,
    size=24,
    center=True,
)
header = (
    header.replace("Arial Black", args.display_font)
    .replace(",Arial,", f",{args.sans_font},")
    .replace("Baskerville", args.serif_font)
)
ass = OUT / "titles.ass"
ass.write_text(header + "\n".join(lines) + "\n")
cmd = [
    "ffmpeg",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-y",
    *video_input,
    "-i",
    str(OUT / "soundtrack.wav"),
    "-vf",
    f"scale=out_range=tv,eq=contrast=1.04:saturation=1.1:brightness=0.003,drawbox=x=0:y=0:w=iw:h=ih:color=0x030b16@0.5:t=fill:enable='gte(t,45)',ass=titles.ass,fade=t=in:st=0:d=0.08,fade=t=out:st=48.6:d=0.4,format=yuv420p",
    "-t",
    str(DUR),
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "256k",
    "-ar",
    "48000",
    "-af",
    "loudnorm=I=-14:TP=-1.5:LRA=7",
    "-movflags",
    "+faststart",
    "-metadata",
    "title=Astra Pool — Your Shot (Action Trailer)",
    str(args.output),
]
print("Exporting action trailer…", flush=True)
subprocess.run(cmd, check=True, cwd=OUT)
print(cmd[-1])
