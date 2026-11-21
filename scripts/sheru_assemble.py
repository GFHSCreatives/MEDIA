#!/usr/bin/env python3
"""Assemble the Sheru Bhai film from generated image-to-video clips.

Drop any subset of the 18 clips into assets/sheru-clips-raw/ as shot-01.mp4 ... shot-18.mp4 (any resolution,
frame rate or length; .mov/.webm/.mkv also work). Every shot that has no clip yet is taken from the existing
still-image animatic (out/sheru-bhai-animatic-clean-1080x1920.mp4), so the film is always complete and gets
better as clips arrive.

What it does
  * conforms every clip to 1080x1920, 24 fps (cover-crop, Lanczos), keeps its own length
  * dialogue: a recorded voice file (assets/sheru-voices/shot-NN.wav|mp3|m4a, optional) is laid over the clip;
    otherwise the clip's own audio is used when it has some; otherwise the shot is silent
  * the music bed is the score's music bus alone (public/audio/sheru-bhai-music-stem.wav), stretched to the new
    running time, ducked under speech, crossfaded into the original brand-card sting
  * the brand card (frame 19) is the exact animated card from the animatic; the film dips to charcoal into it
  * two-pass loudness normalisation to -14 LUFS (-1.5 dBTP), H.264/AAC, faststart
  * writes the dialogue as an SRT timed to the new cut

usage
  python3 scripts/sheru_assemble.py --check          which clips / voices are present, and their specs
  python3 scripts/sheru_assemble.py                  build out/sheru-bhai-film-1080x1920.mp4 (+ .srt, .json)
  options: --clips DIR --voices DIR --out FILE --clip-audio auto|on|off --interp none|blend|mci --voice-delay S
Needs: Python 3.8+ and ffmpeg/ffprobe on the PATH (no Python packages).
"""
import argparse
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACK = ROOT / "out" / "storyboard" / "sheru-bhai" / "animation-shot-pack.json"
TIMELINE = ROOT / "src" / "sheru" / "timeline.json"
FPS, W, H = 24, 1080, 1920
VIDEO_EXTS = (".mp4", ".mov", ".webm", ".mkv", ".m4v")
AUDIO_EXTS = (".wav", ".mp3", ".m4a", ".flac", ".ogg", ".aac")
CHARCOAL = "0x1f1b19"  # the animatic's dip colour
XFADE = 0.8  # seconds, music body -> card sting
SCORE_BODY_END = 74.0  # the score's card sting starts here (frame 1776 / 24)

FFMPEG = shutil.which("ffmpeg")
FFPROBE = shutil.which("ffprobe")


def die(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def run(cmd, capture=False):
    cmd = [str(c) for c in cmd]
    r = subprocess.run(cmd, stdout=subprocess.PIPE if capture else subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if r.returncode != 0:
        die(f"command failed ({r.returncode}): {' '.join(cmd[:8])} ...\n{r.stderr[-1500:]}")
    return r


def probe(path):
    out = run([FFPROBE, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path], capture=True).stdout
    j = json.loads(out)
    v = next((s for s in j["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in j["streams"] if s["codec_type"] == "audio"), None)
    info = {"has_video": v is not None, "has_audio": a is not None, "dur": float(j["format"].get("duration") or 0)}
    if v:
        num, _, den = (v.get("avg_frame_rate") or v.get("r_frame_rate") or "0/1").partition("/")
        info.update(w=int(v["width"]), h=int(v["height"]), fps=(float(num) / float(den or 1)) if float(den or 1) else 0.0)
    return info


def find(folder, stem, exts):
    for e in exts:
        p = Path(folder) / f"{stem}{e}"
        if p.exists() and p.stat().st_size > 0:
            return p
    return None


def mean_volume_db(path):
    r = run([FFMPEG, "-hide_banner", "-nostats", "-i", path, "-vn", "-af", "volumedetect", "-f", "null", "-"], capture=True)
    m = re.search(r"mean_volume:\s*(-?[\d.]+) dB", r.stderr)
    return float(m.group(1)) if m else -91.0


def list_file(paths, dest):
    lines = []
    for p in paths:
        s = Path(p).resolve().as_posix().replace("'", "'\\''")
        lines.append(f"file '{s}'")
    dest.write_text("\n".join(lines) + "\n", encoding="utf-8")


def concat(paths, out, tmp, name):
    lst = tmp / f"{name}.txt"
    list_file(paths, lst)
    run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", out])


def frames_of(path):
    r = run([FFPROBE, "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", path], capture=True)
    return int(r.stdout.strip().split(",")[0])


def hold_for(n, i, pic_dur, args):
    """Seconds to freeze the last frame so a recorded voice line is not cut off (0 when it fits)."""
    if not i["voice"]:
        return 0.0
    need = args.voice_delay + i["vinfo"]["dur"] + 0.25
    hold = max(0.0, min(args.hold_max, need - pic_dur))
    if need - pic_dur > args.hold_max + 0.05:
        print(f"  warning: shot {n:02d} voice line is {need - pic_dur - args.hold_max:.1f}s longer than the picture even after a {args.hold_max:.1f}s hold")
    if hold > 0:
        print(f"  note: shot {n:02d} last frame held for {hold:.2f}s to fit the voice line")
    return hold


def srt_stamp(t):
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--clips", default=str(ROOT / "assets" / "sheru-clips-raw"))
    ap.add_argument("--voices", default=str(ROOT / "assets" / "sheru-voices"))
    ap.add_argument("--fallback", default=str(ROOT / "out" / "sheru-bhai-animatic-clean-1080x1920.mp4"))
    ap.add_argument("--music-stem", default=str(ROOT / "public" / "audio" / "sheru-bhai-music-stem.wav"))
    ap.add_argument("--score", default=str(ROOT / "public" / "audio" / "sheru-bhai-score.wav"))
    ap.add_argument("--out", default=str(ROOT / "out" / "sheru-bhai-film-1080x1920.mp4"))
    ap.add_argument("--clip-audio", choices=["auto", "on", "off"], default="auto", help="use the audio inside the clips (auto: when it is not silent)")
    ap.add_argument("--interp", choices=["none", "blend", "mci"], default="none", help="how to bring e.g. 16 fps clips to 24 fps (none: repeat frames)")
    ap.add_argument("--voice-delay", type=float, default=0.3, help="seconds into the clip before a recorded voice starts")
    ap.add_argument("--hold-max", type=float, default=1.5, help="longest freeze of a clip's last frame to fit a voice line")
    ap.add_argument("--music-db", type=float, default=-9.0, help="music bed level before ducking")
    ap.add_argument("--card-db", type=float, default=-4.0, help="level of the brand-card sting")
    ap.add_argument("--no-card", action="store_true", help="leave the brand card off")
    ap.add_argument("--check", action="store_true", help="only report what is present")
    ap.add_argument("--keep-tmp", action="store_true")
    args = ap.parse_args()

    if not FFMPEG or not FFPROBE:
        die("ffmpeg and ffprobe must be on the PATH")
    pack = json.loads(PACK.read_text(encoding="utf-8"))
    tl = json.loads(TIMELINE.read_text(encoding="utf-8"))
    tl_shots = {s["n"]: s for s in tl["shots"]}
    shots = pack["shots"]

    # ------------------------------------------------------------------ inventory
    inv = {}
    for s in shots:
        n = s["n"]
        stem = f"shot-{n:02d}"
        clip = find(args.clips, stem, VIDEO_EXTS)
        voice = find(args.voices, stem, AUDIO_EXTS) if s["dialogue"] else None
        inv[n] = {"clip": clip, "voice": voice, "cinfo": probe(clip) if clip else None, "vinfo": probe(voice) if voice else None}

    print(f"{'shot':>4}  {'source':<9} {'size':>9} {'fps':>6} {'sec':>6}  audio  voice-file   title")
    for s in shots:
        n, i = s["n"], inv[s["n"]]
        if i["clip"]:
            c = i["cinfo"]
            row = f"{c['w']}x{c['h']:<4} {c['fps']:6.2f} {c['dur']:6.2f}  {'yes' if c['has_audio'] else ' no'}"
            src = "clip"
        else:
            row = f"{'-':>9} {'-':>6} {tl_shots[n]['end'] / FPS - tl_shots[n]['start'] / FPS:6.2f}  {'-':>3}"
            src = "animatic"
        v = f"{i['vinfo']['dur']:.1f}s" if i["voice"] else ("needed" if s["dialogue"] and not (i["cinfo"] and i["cinfo"]["has_audio"]) else "")
        print(f"{n:>4}  {src:<9} {row}  {v:<11} {s['title']}")
    got = sum(1 for i in inv.values() if i["clip"])
    print(f"\n{got}/18 shots have a generated clip; the other {18 - got} come from the animatic.")
    if args.check:
        return
    if got < 18 and not Path(args.fallback).exists():
        die(f"{got}/18 clips found and the fallback animatic is missing: {args.fallback}")
    for p in (args.music_stem, args.score):
        if not Path(p).exists():
            die(f"missing audio file {p}")

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="sheru-asm-"))
    try:
        vparts, aparts, plan = [], [], []
        t_cursor = 0.0
        for s in shots:
            n, i = s["n"], inv[s["n"]]
            v_out, a_out = tmp / f"v{n:02d}.mp4", tmp / f"a{n:02d}.wav"
            fades = []
            if n == 1 and i["clip"]:
                fades.append("fade=t=in:st=0:d=0.5")
            if i["clip"]:
                c = i["cinfo"]
                if abs(c["w"] / c["h"] - W / H) > 0.02:
                    print(f"  note: shot {n:02d} is {c['w']}x{c['h']}, not 9:16: it is cover-cropped to fill the frame")
                chain = []
                if abs(c["fps"] - FPS) > 0.01:
                    chain.append({"none": f"fps={FPS}", "blend": f"framerate=fps={FPS}", "mci": f"minterpolate=fps={FPS}:mi_mode=mci:mc_mode=aobmc:vsbmc=1"}[args.interp])
                chain += [f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos", f"crop={W}:{H}", "setsar=1"]
                hold = hold_for(n, i, c["dur"], args)
                if hold > 0:
                    chain.append(f"tpad=stop_mode=clone:stop_duration={hold:.3f}")
                if n == 18:
                    total = c["dur"] + hold
                    fades.append(f"fade=t=out:st={max(0.0, total - 0.5):.3f}:d=0.5:color={CHARCOAL}")
                chain += fades + [f"format=yuv420p"]
                run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", i["clip"], "-an", "-vf", ",".join(chain), "-r", FPS,
                     "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-g", "48", "-pix_fmt", "yuv420p", v_out])
            else:
                ts = tl_shots[n]
                nxt = tl_shots.get(n + 1) or tl_shots[19]
                a = ts["start"] + (ts["in"]["len"] // 2 if n > 1 else 0)  # skip the dissolve from the previous still
                b = ts["end"] - nxt["in"]["len"] // 2  # and the one into the next
                chain = [f"fps={FPS}", "setsar=1"]
                hold = hold_for(n, i, (b - a) / FPS, args)
                if hold > 0:
                    chain.append(f"tpad=stop_mode=clone:stop_duration={hold:.3f}")
                if n == 18:
                    chain.append(f"fade=t=out:st={(b - a) / FPS + hold - 0.5:.3f}:d=0.5:color={CHARCOAL}")
                chain.append("format=yuv420p")
                run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{a / FPS:.6f}", "-i", args.fallback, "-an", "-frames:v", b - a,
                     "-vf", ",".join(chain), "-r", FPS, "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-g", "48", "-pix_fmt", "yuv420p", v_out])
            nf = frames_of(v_out)
            dur = nf / FPS

            # audio of the shot: recorded voice > the clip's own audio > silence; always exactly the picture's length
            af_tail = f"apad=whole_dur={dur:.6f},atrim=0:{dur:.6f}"
            fmt = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"
            used = "silent"
            if i["voice"]:
                d = int(round(args.voice_delay * 1000))
                run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", i["voice"], "-vn", "-af", f"{fmt},adelay={d}|{d},{af_tail}", "-c:a", "pcm_s16le", "-ar", 48000, "-ac", 2, a_out])
                used = "voice file"
            elif i["clip"] and i["cinfo"]["has_audio"] and args.clip_audio != "off" and (args.clip_audio == "on" or mean_volume_db(i["clip"]) > -55):
                run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", i["clip"], "-vn", "-af", f"{fmt},{af_tail}", "-c:a", "pcm_s16le", "-ar", 48000, "-ac", 2, a_out])
                used = "clip audio"
            else:
                run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", f"{dur:.6f}", "-c:a", "pcm_s16le", a_out])
            vparts.append(v_out)
            aparts.append(a_out)
            plan.append({"n": n, "title": s["title"], "source": "clip" if i["clip"] else "animatic", "audio": used, "start": round(t_cursor, 3), "dur": round(dur, 3)})
            t_cursor += dur
            print(f"  shot {n:02d}  {plan[-1]['source']:<8} {dur:5.2f}s  audio: {used}")
        t_body = t_cursor

        # ------------------------------------------------------------------ brand card (exact animated card from the animatic)
        card_a, card_b = 1776, 1968
        card_dur = 0.0
        if not args.no_card:
            if not Path(args.fallback).exists():
                die(f"the brand card comes from {args.fallback} (or pass --no-card)")
            card = tmp / "card.mp4"
            run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{card_a / FPS:.6f}", "-i", args.fallback, "-an", "-frames:v", card_b - card_a,
                 "-vf", f"fps={FPS},setsar=1,format=yuv420p", "-r", FPS, "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-g", "48", "-pix_fmt", "yuv420p", card])
            vparts.append(card)
            card_dur = (card_b - card_a) / FPS
            ca = tmp / "acard.wav"
            run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", f"{card_dur:.6f}", "-c:a", "pcm_s16le", ca])
            aparts.append(ca)
        total = t_body + card_dur

        video = tmp / "video.mp4"
        voice_track = tmp / "voice.wav"
        concat(vparts, video, tmp, "vlist")
        concat(aparts, voice_track, tmp, "alist")

        # ------------------------------------------------------------------ music: stretched stem -> card sting, ducked under speech
        factor = min(1.5, max(0.75, SCORE_BODY_END / t_body))
        if abs(factor - SCORE_BODY_END / t_body) > 1e-6:
            print(f"  warning: running time {t_body:.1f}s is far from the score's 74 s; the music is stretched only to x{factor:.2f}")
        body_len = t_body + (XFADE if card_dur else 0.0)
        src_end = body_len * factor
        fmt = "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"
        g = [f"[0:a]asplit=2[vkey][vmix]",
             f"[1:a]atrim=0:{src_end:.4f},asetpts=PTS-STARTPTS,atempo={factor:.6f},{fmt},apad=whole_dur={body_len:.4f},atrim=0:{body_len:.4f},volume={args.music_db}dB[body]"]
        if card_dur:
            g += [f"[2:a]atrim={SCORE_BODY_END}:{SCORE_BODY_END + card_dur},asetpts=PTS-STARTPTS,{fmt},volume={args.card_db}dB[card]",
                  f"[body][card]acrossfade=d={XFADE}:c1=tri:c2=tri[musall]"]
        else:
            g += ["[body]anull[musall]"]
        g += ["[musall][vkey]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=450:makeup=1[ducked]",
              "[ducked][vmix]amerge=inputs=2,pan=stereo|c0=c0+c2|c1=c1+c3[mix]"]
        mixed = tmp / "mix.wav"
        run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", voice_track, "-i", args.music_stem, "-i", args.score,
             "-filter_complex", ";".join(g), "-map", "[mix]", "-t", f"{total:.4f}", "-c:a", "pcm_s16le", mixed])

        # two-pass loudness normalisation
        target = "I=-14:TP=-1.5:LRA=11"
        r = run([FFMPEG, "-hide_banner", "-nostats", "-i", mixed, "-af", f"loudnorm={target}:print_format=json", "-f", "null", "-"], capture=True)
        m = json.loads(r.stderr[r.stderr.rfind("{"):r.stderr.rfind("}") + 1])
        ln = (f"loudnorm={target}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}"
              f":measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
        final_audio = tmp / "final.wav"
        run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", mixed, "-af", ln, "-ar", 48000, "-c:a", "pcm_s16le", final_audio])

        # ------------------------------------------------------------------ mux
        run([FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", video, "-i", final_audio, "-map", "0:v:0", "-map", "1:a:0",
             "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
             "-c:a", "aac", "-b:a", "256k", "-ar", 48000, "-movflags", "+faststart", "-shortest", out])

        # ------------------------------------------------------------------ captions timed to the new cut
        cues = []
        for s, p in zip(shots, plan):
            if not s["dialogue"]:
                continue
            i = inv[s["n"]]
            start = p["start"] + (args.voice_delay if i["voice"] else 0.3)
            words = len(s["dialogue"].split())
            length = i["vinfo"]["dur"] if i["voice"] else max(1.3, words / 2.6)
            end = min(p["start"] + p["dur"] - 0.15, start + length + 0.2)
            who = re.sub(r"\s*\(off-screen\)", "", s["speaker"] or "").replace("The bodyguard", "Bodyguard")
            cues.append((start, end, f"{who}: {s['dialogue']}"))
        srt = out.with_suffix(".srt")
        srt.write_text("\n".join(f"{k}\n{srt_stamp(a)} --> {srt_stamp(b)}\n{t}\n" for k, (a, b, t) in enumerate(cues, 1)), encoding="utf-8")
        report = {"output": out.name, "duration_s": round(total, 3), "body_s": round(t_body, 3), "shots": plan, "clips_used": got}
        out.with_suffix(".json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

        fin = probe(out)
        chk = run([FFMPEG, "-hide_banner", "-nostats", "-i", out, "-af", "ebur128=peak=true", "-f", "null", "-"], capture=True).stderr
        lufs = re.findall(r"I:\s+(-?[\d.]+) LUFS", chk)
        peak = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", chk)
        print(f"\nwrote {out}  ({fin['w']}x{fin['h']}, {fin['dur']:.2f} s, {lufs[-1] if lufs else '?'} LUFS, true peak {peak[-1] if peak else '?'} dBFS)")
        print(f"      {srt.name}, {out.with_suffix('.json').name}   ({got}/18 generated clips, {18 - got} from the animatic)")
    finally:
        if not args.keep_tmp:
            shutil.rmtree(tmp, ignore_errors=True)
        else:
            print(f"kept intermediates in {tmp}")


if __name__ == "__main__":
    main()
