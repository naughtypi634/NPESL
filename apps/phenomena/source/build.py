# -*- coding: utf-8 -*-
"""Build the common pronunciation phenomena (常见发音现象 AmE) audio + data.

Each dialogue line gets one clip per voice. Lessons whose `tts` is "qwen" are
synthesized locally from the spoken respellings (yer, wanna, gotta), because
Qwen has no phoneme input; "kokoro" instead injects the lesson's IPA into a
phoneme string for exact weak forms; "cosyvoice" runs CosyVoice 3 from the
same respellings, with CMU tokens for the few it misreads. Clips are
content-addressed, so re-running only synthesizes what is new.

This script no longer writes HTML. The pages are a React app in `../web`;
this script's job is the audio sprite plus one JSON file
(`web/src/generated/phenomena.json`) holding the lessons, the ruby segments
and every line's (start, end) offset inside its sprite. The mini program
reads the same JSON instead of scraping the generated pages.
"""

import argparse
import asyncio
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
from xml.sax.saxutils import escape as xml_escape

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import edge_tts

import azure_tts

ROOT = pathlib.Path(__file__).parent
BASE = ROOT.parent
CONTENT = ROOT / "content"
AUDIO_DIR = BASE / "audio"
# 页面是 ../web 的 React 应用；这份 JSON 是它唯一的内容输入，也供小程序读取。
DATA_OUT = BASE / "web" / "src" / "generated" / "phenomena.json"

# 目录页的分组顺序。这是唯一来源：网页和小程序都按这个顺序排。
CATEGORIES = ["弱读", "缩合", "吞音", "变音", "省略"]

sys.path.insert(0, str(BASE.parents[1] / "tools"))
import audio_sprite  # noqa: E402

VOICES = {
    "f": {"tts": "en-US-AvaNeural", "label": "女声"},
    "m": {"tts": "en-US-AndrewNeural", "label": "男声"},
}
RATE = "+0%"
MARK_RE = re.compile(r"\[([^|\]]*)\|([^|\]]*)(?:\|([^\]]*))?\]")

# Kokoro 走 sidecar venv：模型和 phonemizer 都不在仓库 .venv 里。
KOKORO_PYTHON = pathlib.Path(os.environ.get(
    "KOKORO_PYTHON",
    BASE.parents[1] / "build" / "tts-local" / "venv" / "Scripts" / "python.exe"))
KOKORO_WORKER = BASE.parents[1] / "apps" / "collocation" / "source" / "kokoro_worker.py"

# Qwen3-TTS Base 用 conversation 的同一套克隆音色；没有音素入口，只能喂拼写。
QWEN_PYTHON = pathlib.Path(os.environ.get(
    "QWEN_PYTHON", r"F:\AIProject\tts-lab\.venv\Scripts\python.exe"))
QWEN_WORKER = ROOT / "qwen_clone_worker.py"
QWEN_VOICES = {"f": "h2", "m": "c"}

# CosyVoice 3 用独立 venv（F:\\AIProject\\CosyVoice），参考音仍是 h2 / c。
COSYVOICE_PYTHON = pathlib.Path(os.environ.get(
    "COSYVOICE_PYTHON", r"F:\AIProject\CosyVoice\.venv\Scripts\python.exe"))
COSYVOICE_WORKER = ROOT / "cosyvoice_worker.py"
COSYVOICE_VOICES = {"f": "h2", "m": "c"}
SIDECAR_VOICES = {"qwen": QWEN_VOICES, "cosyvoice": COSYVOICE_VOICES}

BACKEND = ""  # --tts 覆盖 content 里的 tts 字段，用于试听另一种音源
RISKY_SPELLINGS = {"usta", "didncha", "cancha", "doncha", "c'mon", "whaddaya"}
# CosyVoice 3: these lessons read the written form and let the model reduce
# naturally; forcing respellings made H2 sound deliberate and misread some
# forms (to -> da, orderin' -> order in, Woncha/Havencha/Arencha).
NATURAL_LESSONS = {1, 6, 13, 20, 21}
SIDECARS = {
    "kokoro": (KOKORO_PYTHON, KOKORO_WORKER),
    "qwen": (QWEN_PYTHON, QWEN_WORKER),
    "cosyvoice": (COSYVOICE_PYTHON, COSYVOICE_WORKER),
}


def mark_parts(part):
    match = MARK_RE.fullmatch(part)
    if not match:
        raise ValueError(f"bad mark: {part!r}")
    return match.group(1), match.group(2), (match.group(3) or "").strip()


def plain(text):
    return "".join(re.findall(r"[a-z0-9']+", text.lower().replace("’", "'")))


def backend_for(lesson):
    return BACKEND or lesson.get("tts") or "edge"


def respelled_text(display):
    """The spoken side of every mark, as plain text (for backends without IPA).

    Qwen 会把少数生造拼写读成别的词（'er → all these、tea 'r → tea your、
    usta → ask to、c'mon → Shimon），这些位置退回原词，宁可少一个弱读也不出错。
    """
    def pick(match):
        written, spoken = match.group(1), (match.group(2) or match.group(1)).strip()
        if spoken.startswith("'") or spoken.lower() in RISKY_SPELLINGS:
            return written
        return spoken
    return MARK_RE.sub(pick, display)


def written_text(display):
    """The original sentence: drop the annotation side of every mark."""
    return MARK_RE.sub(r"\1", display)


def spoken_text(line):
    """What the spoken clip says.

    Defaults to the written sentence: Edge reduces function words on its own at
    natural rate. A line can override it with a dictionary respelling ("gonna")
    when Edge does not reduce the phrase by itself.
    """
    return (line.get("say") or "").strip() or written_text(line["display"])


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def clip_rel(text, voice, rate, variant=""):
    """'' for an empty text, otherwise audio/<voice>/<2>/<id>.mp3.

    `variant` keeps Azure renders apart from Edge ones without changing the
    hashes of existing Edge clips.
    """
    text = " ".join(text.split())
    if not text:
        return ""
    key = f"{text}|{voice}|{rate}" + (f"|{variant}" if variant else "")
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    return f"{voice}/{digest[:2]}/{digest}.mp3"


def annotated_body(lesson, display):
    """SSML body for an Azure lesson: marked spans become <phoneme> tags."""
    ipa_by_form = {
        plain(target["spoken"]): target["ipa"]
        for target in lesson.get("targets", [])
        if target.get("ipa")
    }
    out = []
    for part in re.split(r"(\[[^\]]*\])", display):
        if part.startswith("[") and part.endswith("]"):
            written, spoken, mark_ipa = mark_parts(part)
            ipa = mark_ipa or ipa_by_form.get(plain(spoken))
            if ipa:
                out.append(
                    f"<phoneme alphabet='ipa' ph='{ipa}'>{xml_escape(written)}</phoneme>"
                )
            else:
                out.append(xml_escape(written))
        elif part:
            out.append(xml_escape(part))
    return "".join(out)


def body_variant(body):
    return "azure:" + hashlib.sha1(body.encode("utf-8")).hexdigest()[:8]


def k_phonemes(ipa):
    """Content IPA -> Kokoro phoneme alphabet（美音 r 一律是 ɹ）。"""
    return ipa.replace("r", "ɹ")


def annotated_segments(lesson, display):
    """Kokoro payload: plain pieces get phonemized, marked IPA is forced."""
    ipa_by_form = {
        plain(target["spoken"]): target["ipa"]
        for target in lesson.get("targets", [])
        if target.get("ipa")
    }
    segments = []
    for part in re.split(r"(\[[^\]]*\])", display):
        if part.startswith("[") and part.endswith("]"):
            written, spoken, mark_ipa = mark_parts(part)
            ipa = mark_ipa or ipa_by_form.get(plain(spoken))
            if ipa:
                segments.append({"phonemes": k_phonemes(ipa)})
            else:
                segments.append({"text": written})
        elif part.strip():
            segments.append({"text": part.strip()})
    return segments


def segment_key(segments):
    return "kokoro:" + json.dumps(segments, ensure_ascii=False, separators=(",", ":"))


def kokoro_clips(lesson, display):
    key = segment_key(annotated_segments(lesson, display))
    return {f"clip-{voice}": clip_rel(key, voice, RATE) for voice in VOICES}


def qwen_clips(lesson, display):
    """Qwen has no phoneme input: feed the respelled spoken forms instead."""
    text = " ".join(respelled_text(display).split())
    key = "qwen-clone:" + text
    return {f"clip-{voice}": clip_rel(key, voice, RATE) for voice in VOICES}


def sentence_case(text):
    """Capitalise sentence starts without touching anything else."""
    out = []
    capital = True
    for ch in text:
        if capital and ch.isalpha():
            out.append(ch.upper())
            capital = False
        else:
            out.append(ch)
            if ch in ".!?":
                capital = True
            elif ch.isalnum():
                capital = False
    return "".join(out)


def cosyvoice_text(lesson, display):
    """CosyVoice 3: written form for natural lessons, safe respellings elsewhere."""
    if lesson.get("num") in NATURAL_LESSONS:
        text = written_text(display)
    else:
        text = respelled_text(display)
    return sentence_case(" ".join(text.split()))


def cosyvoice_clips(lesson, display):
    """CosyVoice 3 also takes text only; natural lessons keep full spelling."""
    text = cosyvoice_text(lesson, display)
    key = "cosyvoice:" + text
    return {f"clip-{voice}": clip_rel(key, voice, RATE) for voice in VOICES}


def line_clips(lesson, line):
    backend = backend_for(lesson)
    if backend == "azure":
        body = annotated_body(lesson, line["display"])
        variant = body_variant(body)
        return {
            f"clip-{voice}": clip_rel(body, voice, RATE, variant) for voice in VOICES
        }
    if backend == "kokoro":
        return kokoro_clips(lesson, line["display"])
    if backend == "qwen":
        return qwen_clips(lesson, line["display"])
    if backend == "cosyvoice":
        return cosyvoice_clips(lesson, line["display"])
    text = spoken_text(line)
    return {f"clip-{voice}": clip_rel(text, voice, RATE) for voice in VOICES}


def lesson_jobs(lesson):
    """(relative path, payload, voice, rate, backend) for every clip."""
    jobs = []
    backend = backend_for(lesson)

    def add_text(text, voice, rate):
        rel = clip_rel(text, voice, rate)
        if rel:
            jobs.append((rel, " ".join(text.split()), voice, rate, "edge"))

    def add_body(body, voice):
        rel = clip_rel(body, voice, RATE, body_variant(body))
        if rel:
            jobs.append((rel, body, voice, RATE, "azure"))

    def add_kokoro(display, voice):
        segments = annotated_segments(lesson, display)
        rel = clip_rel(segment_key(segments), voice, RATE)
        if rel:
            jobs.append((rel, segments, voice, RATE, "kokoro"))

    def add_qwen(display, voice):
        text = " ".join(respelled_text(display).split())
        rel = clip_rel("qwen-clone:" + text, voice, RATE)
        if rel:
            jobs.append((rel, text, voice, RATE, "qwen"))

    def add_cosyvoice(display, voice):
        text = cosyvoice_text(lesson, display)
        rel = clip_rel("cosyvoice:" + text, voice, RATE)
        if rel:
            jobs.append((rel, text, voice, RATE, "cosyvoice"))

    for line in lesson["lines"]:
        for voice in VOICES:
            if backend == "azure":
                add_body(annotated_body(lesson, line["display"]), voice)
            elif backend == "kokoro":
                add_kokoro(line["display"], voice)
            elif backend == "qwen":
                add_qwen(line["display"], voice)
            elif backend == "cosyvoice":
                add_cosyvoice(line["display"], voice)
            else:
                add_text(spoken_text(line), voice, RATE)
    for target in lesson.get("targets", []):
        demo = target.get("demo") or {}
        text = (demo.get("say") or "").strip() or demo.get("text")
        if not text:
            continue
        display = demo.get("display") or text
        if backend == "azure":
            for voice in VOICES:
                add_body(annotated_body(lesson, display), voice)
        elif backend == "kokoro":
            for voice in VOICES:
                add_kokoro(display, voice)
        elif backend == "qwen":
            for voice in VOICES:
                add_qwen(display, voice)
        elif backend == "cosyvoice":
            for voice in VOICES:
                add_cosyvoice(display, voice)
        else:
            for voice in VOICES:
                add_text(text, voice, RATE)
    return jobs


def load_lessons(only=None):
    lessons = []
    for path in sorted(CONTENT.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data = [data]
        lessons.extend(data)
    numbers = [lesson["num"] for lesson in lessons]
    if len(numbers) != len(set(numbers)):
        raise ValueError("duplicate lesson number in content/")
    lessons.sort(key=lambda lesson: lesson["num"])
    if only:
        lessons = [lesson for lesson in lessons if lesson["num"] in only]
    return lessons


async def synthesize(text, voice, rate, semaphore):
    tts = VOICES[voice]["tts"]
    async with semaphore:
        last = None
        for attempt in range(5):
            try:
                communicate = edge_tts.Communicate(text, tts, rate=rate)
                audio = bytearray()
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        audio.extend(chunk["data"])
                if not audio:
                    raise RuntimeError("empty audio")
                return bytes(audio)
            except Exception as error:  # noqa: BLE001 - retry then surface
                last = error
                await asyncio.sleep(2 * (attempt + 1))
        raise last


def run_sidecar(backend, jobs):
    """整批交给 sidecar venv 一次合成，模型只加载一次。"""
    python, worker = SIDECARS[backend]
    manifest = (BASE.parents[1] / "build" / "tts-local"
                / f"jobs-phenomena-{backend}.json")
    manifest.parent.mkdir(parents=True, exist_ok=True)
    if backend == "kokoro":
        payload = [
            {"out": str(AUDIO_DIR / rel), "segments": value, "voice": voice}
            for rel, value, voice, rate, _ in jobs
        ]
    else:
        payload = [
            {"out": str(AUDIO_DIR / rel), "text": value,
             "voice": SIDECAR_VOICES[backend][voice]}
            for rel, value, voice, rate, _ in jobs
        ]
    manifest.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    subprocess.run([str(python), str(worker), str(manifest)], check=False)
    return [rel for rel, *_ in jobs if not (AUDIO_DIR / rel).exists()]


async def ensure_clips(lessons, voices):
    wanted = {}
    for lesson in lessons:
        for rel, payload, voice, rate, backend in lesson_jobs(lesson):
            if voice in voices:
                wanted[rel] = (payload, voice, rate, backend)
    missing = [
        (rel, payload, voice, rate, backend)
        for rel, (payload, voice, rate, backend) in wanted.items()
        if not (AUDIO_DIR / rel).exists()
    ]
    print(f"audio: {len(wanted)} clips, {len(missing)} to synthesize")
    if not missing:
        return []
    failed = []
    for backend in ("kokoro", "qwen", "cosyvoice"):
        group = [job for job in missing if job[4] == backend]
        if group:
            print(f"audio: {backend} {len(group)} clips")
            failed.extend(run_sidecar(backend, group))
    other = [job for job in missing if job[4] not in SIDECARS]
    if not other:
        print("audio: done" if not failed else f"audio: {len(failed)} failed")
        return failed
    semaphore = asyncio.Semaphore(4)
    done = 0

    async def one(rel, payload, voice, rate, backend):
        nonlocal done
        path = AUDIO_DIR / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if backend == "azure":
            data = await asyncio.to_thread(
                azure_tts.synthesize, payload, VOICES[voice]["tts"]
            )
        else:
            data = await synthesize(payload, voice, rate, semaphore)
        path.write_bytes(data)
        done += 1
        if done % 10 == 0 or done == len(other):
            print(f"audio: {done}/{len(other)}")

    results = await asyncio.gather(
        *(one(*job) for job in other),
        return_exceptions=True,
    )
    failed.extend(
        job[0] for job, result in zip(other, results)
        if isinstance(result, Exception)
    )
    if failed:
        print(f"audio: {len(failed)} failed: {failed[:5]}")
    else:
        print("audio: done")
    return failed


def segments(display):
    """`[Your|yer|jər] stop` -> [["Your", "yer"], [" stop", 0]].

    Same shape the mini program already stores (`ruby_parts` in
    tools/miniprogram/build_data.py): `[文本, 读音或 0]`. Whitespace is
    collapsed but spaces between parts are kept — only the two ends of the
    whole sentence are trimmed, or `tea [or|'r] coffee` would lose its gaps.
    The IPA side of a mark is dropped here; it is there for TTS, not for
    reading.
    """
    parts = []
    for piece in re.split(r"(\[[^\]]*\])", display):
        if piece.startswith("[") and piece.endswith("]"):
            written, spoken, _ = mark_parts(piece)
            parts.append([re.sub(r"\s+", " ", written),
                          re.sub(r"\s+", " ", spoken)])
        elif piece:
            parts.append([re.sub(r"\s+", " ", piece), 0])
    if parts:
        parts[0][0] = parts[0][0].lstrip()
        parts[-1][0] = parts[-1][0].rstrip()
    return [part for part in parts if part[0]]


class ClipPlan:
    """第一遍：只登记每个可播放元素对应哪几条录音，不产出属性。"""

    def __init__(self):
        self.items: list[dict] = []

    def attrs(self, clips):
        self.items.append({voice: clips.get(f"clip-{voice}") for voice in VOICES})
        return ""


class ClipCursor:
    """第二遍：按顺序发 (start, end) 时间偏移。"""

    def __init__(self, spans: list[dict]):
        self.spans = spans
        self.index = 0

    def take(self):
        item = self.spans[self.index] if self.index < len(self.spans) else {}
        self.index += 1
        return {
            voice: [round(span[0], 3), round(span[1], 3)]
            for voice, span in item.items()
            if span
        }


def build_sprites(plan: ClipPlan) -> tuple[ClipCursor, dict]:
    """每章每音色一个 sprite；返回偏移游标和页面要引用的地址。"""
    spans: list[dict] = [dict() for _ in plan.items]
    urls: dict[str, str] = {}
    for voice in VOICES:
        picks = []
        for index, item in enumerate(plan.items):
            rel = item.get(voice)
            if not rel:
                continue
            path = AUDIO_DIR / rel
            if path.exists():
                picks.append((index, rel.replace("\\", "/"), path.read_bytes()))
        if not picks:
            continue
        blob, offsets = audio_sprite.concat([chunk for _, _, chunk in picks])
        # 名字带音频摘要：重录同一文本会改变字节，纯文本名字会让
        # immutable 缓存继续发旧录音。
        name = audio_sprite.name_for([
            f"{rel}:{hashlib.sha1(data).hexdigest()[:10]}"
            for _, rel, data in picks
        ])
        rel = f"sprites/{name}.mp3"
        dst = AUDIO_DIR / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(blob)
        urls[voice] = rel
        for (index, _, _), span in zip(picks, offsets):
            spans[index][voice] = span
    return ClipCursor(spans), urls


def text_clips(lesson, text):
    """clip attrs for one plain string, honouring the lesson's TTS backend."""
    backend = backend_for(lesson)
    if backend == "azure":
        body = xml_escape(text)
        variant = body_variant(body)
        return {f"clip-{voice}": clip_rel(body, voice, RATE, variant) for voice in VOICES}
    if backend == "kokoro":
        key = segment_key([{"text": text}])
        return {f"clip-{voice}": clip_rel(key, voice, RATE) for voice in VOICES}
    if backend == "qwen":
        key = "qwen-clone:" + " ".join(text.split())
        return {f"clip-{voice}": clip_rel(key, voice, RATE) for voice in VOICES}
    if backend == "cosyvoice":
        key = "cosyvoice:" + sentence_case(" ".join(text.split()))
        return {f"clip-{voice}": clip_rel(key, voice, RATE) for voice in VOICES}
    return {f"clip-{voice}": clip_rel(text, voice, RATE) for voice in VOICES}


def target_clips(lesson, target):
    """录音清单 for a target's demo sentence, or None when it has none."""
    demo = target.get("demo") or {}
    text = (demo.get("say") or "").strip() or demo.get("text")
    if not text:
        return None
    backend = backend_for(lesson)
    display = demo.get("display") or text
    if backend == "azure":
        body = annotated_body(lesson, display)
        return {
            f"clip-{voice}": clip_rel(body, voice, RATE, body_variant(body))
            for voice in VOICES
        }
    if backend == "kokoro":
        return kokoro_clips(lesson, display)
    if backend == "qwen":
        return qwen_clips(lesson, display)
    if backend == "cosyvoice":
        return cosyvoice_clips(lesson, display)
    return text_clips(lesson, text)


def lesson_record(lesson):
    """One lesson as the JSON the React app and the mini program both read.

    Two passes, exactly like the old HTML build: first register which clips
    each playable element needs (in render order), then hand out the
    (start, end) offsets the sprite builder produced for that same order.
    """
    plan = ClipPlan()
    targets = []
    for target in lesson.get("targets", []):
        demo = target.get("demo") or {}
        text = (demo.get("say") or "").strip() or demo.get("text")
        clips = target_clips(lesson, target)
        if clips:
            plan.attrs(clips)
        record = {"written": target["written"], "spoken": target["spoken"]}
        if clips:
            record["seg"] = segments(demo.get("display") or text)
        targets.append(record)

    lines = []
    for line in lesson["lines"]:
        plan.attrs(line_clips(lesson, line))
        lines.append({"seg": segments(line["display"]), "zh": line["zh"]})

    cursor, sprites = build_sprites(plan)
    for record in targets:
        if "seg" in record:
            record["span"] = cursor.take()
    for record in lines:
        record["span"] = cursor.take()

    return {
        "num": lesson["num"],
        "slug": f"{lesson['num']:02d}-{slug(lesson['title_en'])}",
        "title_en": lesson["title_en"],
        "title_zh": lesson["title_zh"],
        "category": lesson.get("category", ""),
        "sprites": sprites,
        "targets": targets,
        "lines": lines,
    }


def write_data(lessons):
    """Write web/src/generated/phenomena.json — the app's only content input."""
    payload = {
        "categories": CATEGORIES,
        "lessons": [lesson_record(lesson) for lesson in lessons],
    }
    DATA_OUT.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    DATA_OUT.write_text(text, encoding="utf-8")
    print(f"wrote phenomena.json ({len(lessons)} lessons, {len(text) / 1024:.0f} KB)")
    return DATA_OUT


async def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", type=int, nargs="*", help="lesson numbers")
    parser.add_argument("--skip-audio", action="store_true")
    parser.add_argument("--voices", default="f,m", help="要合成的音色：f,m")
    parser.add_argument("--tts", choices=["azure", "edge", "kokoro", "qwen", "cosyvoice"],
                        default="", help="覆盖 content 的 tts 字段，试听另一音源")
    args = parser.parse_args()
    global BACKEND
    BACKEND = args.tts

    # 全量构建时先清掉旧的 sprite，避免改过的章节留下无人引用的文件。
    if not args.only:
        sprites_dir = AUDIO_DIR / "sprites"
        if sprites_dir.exists():
            shutil.rmtree(sprites_dir)

    voices = [x.strip() for x in args.voices.split(",") if x.strip()]
    bad = [x for x in voices if x not in VOICES]
    if bad:
        print(f"未知音色：{', '.join(bad)}")
        return 1

    lessons = load_lessons(set(args.only) if args.only else None)

    failed = []
    if not args.skip_audio:
        failed = await ensure_clips(lessons, voices)

    ready = []
    for lesson in lessons:
        missing = [
            rel for rel, *_ in lesson_jobs(lesson) if not (AUDIO_DIR / rel).exists()
        ]
        if missing:
            print(f"skip lesson {lesson['num']:02d}: {len(missing)} clips missing")
            continue
        ready.append(lesson)

    write_data(ready)
    if args.only:
        print("注意：--only 只写了这几课的 JSON；页面需要全量构建才有 30 章。")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
