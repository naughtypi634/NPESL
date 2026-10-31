# -*- coding: utf-8 -*-
"""Build the common pronunciation phenomena (常见发音现象 AmE) course pages.

Every dialogue line gets two clips per voice: the written version (original
spelling, slowed down) and the spoken version (original spelling at natural
rate, where Edge reduces function words by itself). Clips are content-addressed,
so re-running only synthesizes what is new.
"""

import argparse
import asyncio
import hashlib
import html
import json
import pathlib
import re
import shutil
import sys
from xml.sax.saxutils import escape as xml_escape

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

import edge_tts

import azure_tts

ROOT = pathlib.Path(__file__).parent
BASE = ROOT.parent
CONTENT = ROOT / "content"
AUDIO_DIR = BASE / "audio"

sys.path.insert(0, str(BASE.parents[1] / "tools"))
import audio_sprite  # noqa: E402

VOICES = {
    "f": {"tts": "en-US-AvaNeural", "label": "女声"},
    "m": {"tts": "en-US-AndrewNeural", "label": "男声"},
}
RATE = "+0%"
MARK_RE = re.compile(r"\[([^|\]]*)\|([^|\]]*)(?:\|([^\]]*))?\]")


def mark_parts(part):
    match = MARK_RE.fullmatch(part)
    if not match:
        raise ValueError(f"bad mark: {part!r}")
    return match.group(1), match.group(2), (match.group(3) or "").strip()


def plain(text):
    return "".join(re.findall(r"[a-z0-9']+", text.lower().replace("’", "'")))


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


def line_clips(lesson, line):
    if lesson.get("tts") == "azure":
        body = annotated_body(lesson, line["display"])
        variant = body_variant(body)
        return {
            f"clip-{voice}": clip_rel(body, voice, RATE, variant) for voice in VOICES
        }
    text = spoken_text(line)
    return {f"clip-{voice}": clip_rel(text, voice, RATE) for voice in VOICES}


def lesson_jobs(lesson):
    """(relative path, payload, voice, rate, backend) for every clip."""
    jobs = []
    azure = lesson.get("tts") == "azure"

    def add_text(text, voice, rate):
        rel = clip_rel(text, voice, rate)
        if rel:
            jobs.append((rel, " ".join(text.split()), voice, rate, "edge"))

    def add_body(body, voice):
        rel = clip_rel(body, voice, RATE, body_variant(body))
        if rel:
            jobs.append((rel, body, voice, RATE, "azure"))

    for line in lesson["lines"]:
        for voice in VOICES:
            if azure:
                add_body(annotated_body(lesson, line["display"]), voice)
            else:
                add_text(spoken_text(line), voice, RATE)
    for target in lesson.get("targets", []):
        demo = target.get("demo") or {}
        text = (demo.get("say") or "").strip() or demo.get("text")
        if not text:
            continue
        if azure:
            for voice in VOICES:
                add_body(annotated_body(lesson, demo.get("display") or text), voice)
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
        if done % 10 == 0 or done == len(missing):
            print(f"audio: {done}/{len(missing)}")

    results = await asyncio.gather(
        *(one(*job) for job in missing),
        return_exceptions=True,
    )
    failed = [job[0] for job, result in zip(missing, results) if isinstance(result, Exception)]
    if failed:
        print(f"audio: {len(failed)} failed: {failed[:5]}")
    else:
        print("audio: done")
    return failed


def marks_html(display):
    out = []
    for part in re.split(r"(\[[^\]]*\])", display):
        if part.startswith("[") and part.endswith("]"):
            original, spoken, _ = mark_parts(part)
            out.append(
                f"<ruby>{html.escape(original)}<rt>{html.escape(spoken)}</rt></ruby>"
            )
        elif part:
            out.append(html.escape(part))
    return "".join(out)


def clip_attrs(clips, prefix=""):
    return " ".join(
        f'data-{key}="{value}"' for key, value in clips.items() if value
    )


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

    def attrs(self, clips):
        item = self.spans[self.index] if self.index < len(self.spans) else {}
        self.index += 1
        parts = []
        for voice, span in item.items():
            if span:
                parts.append(
                    f'data-start-{voice}="{span[0]:.3f}" '
                    f'data-end-{voice}="{span[1]:.3f}"'
                )
        return " ".join(parts)


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
    if lesson.get("tts") == "azure":
        body = xml_escape(text)
        variant = body_variant(body)
        return {f"clip-{voice}": clip_rel(body, voice, RATE, variant) for voice in VOICES}
    return {f"clip-{voice}": clip_rel(text, voice, RATE) for voice in VOICES}


def build_targets(lesson, audio):
    cards = []
    for target in lesson.get("targets", []):
        parts = [
            '<span class="pair">'
            f'<span class="w">{html.escape(target["written"])}</span>'
            '<span class="arrow">→</span>'
            f'<span class="s">{html.escape(target["spoken"])}</span>'
            "</span>"
        ]
        demo = target.get("demo") or {}
        text = (demo.get("say") or "").strip() or demo.get("text")
        if text:
            if lesson.get("tts") == "azure":
                body = annotated_body(lesson, demo.get("display") or text)
                variant = body_variant(body)
                clips = {
                    f"clip-{voice}": clip_rel(body, voice, RATE, variant) for voice in VOICES
                }
            else:
                clips = text_clips(lesson, text)
            parts.append(
                f'<button class="pill" type="button" {audio.attrs(clips)}>'
                f'<span class="play">▶</span>{marks_html(demo.get("display") or text)}</button>'
            )
        cards.append(f'<div class="target">{"".join(parts)}</div>')
    return "\n      ".join(cards)


def build_lines(lesson, audio):
    rows = []
    for line in lesson["lines"]:
        clips = line_clips(lesson, line)
        rows.append(
            f'<button class="line" type="button" {audio.attrs(clips)}>'
            f'<span class="txt">{marks_html(line["display"])}</span>'
            f'<span class="zh">{html.escape(line["zh"])}</span>'
            "</button>"
        )
    return "\n      ".join(rows)


def build_page(lesson, total):
    template = (ROOT / "template.html").read_text(encoding="utf-8")
    page = template
    page = page.replace("__NUM__", f"{lesson['num']:02d}")
    page = page.replace("__TITLE_EN__", html.escape(lesson["title_en"]))
    page = page.replace("__CATEGORY__", html.escape(lesson.get("category", "")))
    page = page.replace("__TITLE_ZH__", html.escape(lesson["title_zh"]))
    plan = ClipPlan()
    build_targets(lesson, plan)
    build_lines(lesson, plan)
    audio, sprites = build_sprites(plan)
    page = page.replace("<!--TARGETS-->", build_targets(lesson, audio))
    page = page.replace("<!--LINES-->", build_lines(lesson, audio))
    page = page.replace(
        "<!--SPRITES-->",
        '<script id="spriteMap" type="application/json">'
        + json.dumps(sprites, separators=(",", ":")) + "</script>",
    )
    page = page.replace("__LESSON_COUNT__", str(total))
    name = f"{lesson['num']:02d}-{slug(lesson['title_en'])}.html"
    out = BASE / name
    out.write_text(page, encoding="utf-8")
    print(f"built {name} ({out.stat().st_size / 1024:.0f} KB)")
    return name


INDEX_STYLE = """
  :root {
    --bg:#ffffff; --fg:#1d1d1f; --muted:#6e6e73; --rule:#e5e5ea;
    --surface:#f5f5f7;
    --accent:var(--blue, #0071e3); --tint:var(--blue-tint, #e8f2ff);
    --on-accent:var(--on-blue, #ffffff);
    --font:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI Variable",
      "Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
    color-scheme:light;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#000000; --fg:#f5f5f7; --muted:#98989d; --rule:#2c2c2e;
      --surface:#1c1c1e;
      --accent:var(--blue, #0a84ff); --tint:var(--blue-tint, #0d2a45);
      color-scheme:dark; }
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:var(--font);
    -webkit-font-smoothing:antialiased; }
  .page { max-width:760px; margin:0 auto;
    padding:clamp(40px,7vh,72px) 24px 96px; }
  h1 { margin:0; font-size:clamp(2rem,6vw,2.8rem); font-weight:700;
    letter-spacing:-0.03em; line-height:1.08; }
  .sub { margin:10px 0 0; color:var(--muted); font-size:16px; }
  .chips { display:flex; flex-wrap:wrap; gap:8px; margin-top:26px; }
  .chips button { appearance:none; font:inherit; font-size:14px; padding:7px 15px;
    border:1px solid var(--rule); border-radius:999px; background:transparent;
    color:var(--fg); cursor:pointer; }
  .chips button:hover { background:var(--surface); }
  .chips button[aria-pressed="true"] { background:var(--accent);
    border-color:var(--accent); color:var(--on-accent); }
  .group h2 { margin:28px 0 4px; font-size:14px; font-weight:600;
    color:var(--muted); letter-spacing:0.04em; }
  .group .list { margin-top:0; }
  .list { display:flex; flex-direction:column; gap:16px; margin-top:36px;
    border-top:0; }
  .row { display:flex; align-items:baseline; gap:16px; padding:16px 18px;
    border:1px solid var(--rule); border-radius:var(--radius-card, 24px);
    background:var(--bg); text-decoration:none; color:inherit;
    transition:background-color .15s ease, box-shadow .15s ease,
      transform .15s ease; }
  .row:hover { background:var(--surface); transform:translateY(-1px);
    box-shadow:var(--shadow-card, 0 1px 2px rgba(0, 0, 0, 0.05),
      0 8px 24px rgba(0, 0, 0, 0.06)); }
  .row:active { transform:scale(0.995); }
  .num { width:26px; flex:none; color:var(--muted); font-size:13px;
    font-variant-numeric:tabular-nums; }
  .title { flex:1; min-width:0; }
  .en { display:block; font-size:18px; font-weight:600; letter-spacing:-0.01em; }
  .zh { display:block; margin-top:2px; font-size:15px; color:var(--muted); }
  .tag { flex:0 1 auto; min-width:0; max-width:44%; text-align:right;
    font-size:14px; color:var(--accent); font-weight:600;
    font-variant-numeric:tabular-nums; overflow-wrap:anywhere; line-height:1.35; }
  .done { flex:none; width:20px; text-align:center; color:var(--accent); font-size:15px; }
  @media (max-width:560px) {
    .tag { display:none; }
    .row { gap:12px; padding:16px 14px; }
  }
"""


CATEGORIES = ["弱读", "缩合", "吞音", "变音", "省略"]


def build_index(lessons):
    groups = []
    for category in CATEGORIES:
        rows = []
        for lesson in lessons:
            if lesson.get("category") != category:
                continue
            name = f"{lesson['num']:02d}-{slug(lesson['title_en'])}"
            tag = " / ".join(target["spoken"] for target in lesson.get("targets", []))
            rows.append(
                f'<a class="row" href="{name}" data-num="{lesson["num"]}">'
                f'<span class="title"><span class="en">{html.escape(lesson["title_en"])}</span>'
                f'<span class="zh">{html.escape(lesson["title_zh"])}</span></span>'
                f'<span class="tag">{html.escape(tag)}</span>'
                '<span class="done" aria-hidden="true"></span></a>'
            )
        if rows:
            groups.append(
                f'<section class="group" data-cat="{category}">'
                f"<h2>{category}</h2>"
                f'<div class="list">{"".join(rows)}</div></section>'
            )
    chips = ['<button type="button" data-cat="all" aria-pressed="true">全部</button>']
    for category in CATEGORIES:
        if any(lesson.get("category") == category for lesson in lessons):
            chips.append(
                f'<button type="button" data-cat="{category}" aria-pressed="false">'
                f"{category}</button>"
            )
    page = (
        "<!doctype html>\n<html lang=\"zh-CN\">\n<head>\n<meta charset=\"utf-8\">\n"
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        "<title>常见发音现象(AmE)</title>\n"
        f"<style>{INDEX_STYLE}</style>\n</head>\n<body>\n<div class=\"page\">\n"
        "<h1>常见发音现象(AmE)</h1>\n"
        f'<div class="chips">{"".join(chips)}</div>\n'
        f'{"".join(groups)}\n</div>\n'
        "<script>\n"
        "(function(){\n"
        "var CHIP_KEY='rs-cat';\n"
        "var chips=document.querySelectorAll('.chips button');\n"
        "var groups=document.querySelectorAll('.group');\n"
        "function apply(cat){\n"
        "  for(var i=0;i<groups.length;i++){\n"
        "    groups[i].style.display=(cat==='all'||groups[i].getAttribute('data-cat')===cat)?'':'none';\n"
        "  }\n"
        "  for(var j=0;j<chips.length;j++){\n"
        "    chips[j].setAttribute('aria-pressed',chips[j].getAttribute('data-cat')===cat?'true':'false');\n"
        "  }\n"
        "  try{localStorage.setItem(CHIP_KEY,cat);}catch(e){}\n"
        "}\n"
        "for(var k=0;k<chips.length;k++){\n"
        "  chips[k].addEventListener('click',function(e){apply(e.currentTarget.getAttribute('data-cat'));});\n"
        "}\n"
        "var saved='all';try{saved=localStorage.getItem(CHIP_KEY)||'all';}catch(e){}\n"
        "apply(saved);\n"
        "var done=[];try{done=JSON.parse(localStorage.getItem('rs-done')||'[]');}catch(e){}\n"
        "var rows=document.querySelectorAll('.row');\n"
        "for(var i=0;i<rows.length;i++){var n=parseInt(rows[i].getAttribute('data-num'),10);\n"
        "if(done.indexOf(n)>=0)rows[i].querySelector('.done').textContent='✓';}\n"
        "})();\n"
        "</script>\n</body>\n</html>\n"
    )
    (BASE / "index.html").write_text(page, encoding="utf-8")
    print(f"built index.html ({len(lessons)} lessons)")


async def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", type=int, nargs="*", help="lesson numbers")
    parser.add_argument("--skip-audio", action="store_true")
    parser.add_argument("--index-only", action="store_true")
    parser.add_argument("--voices", default="f,m", help="要合成的音色：f,m")
    args = parser.parse_args()

    # 全量构建时先清掉旧的 sprite，避免改过的章节留下无人引用的文件。
    if not args.only and not args.index_only:
        sprites_dir = AUDIO_DIR / "sprites"
        if sprites_dir.exists():
            shutil.rmtree(sprites_dir)

    voices = [x.strip() for x in args.voices.split(",") if x.strip()]
    bad = [x for x in voices if x not in VOICES]
    if bad:
        print(f"未知音色：{', '.join(bad)}")
        return 1

    lessons = load_lessons(set(args.only) if args.only else None)
    if args.index_only:
        build_index(load_lessons())
        return 0

    failed = []
    if not args.skip_audio:
        failed = await ensure_clips(lessons, voices)

    built = 0
    for lesson in lessons:
        missing = [
            rel for rel, *_ in lesson_jobs(lesson) if not (AUDIO_DIR / rel).exists()
        ]
        if missing:
            print(f"skip lesson {lesson['num']:02d}: {len(missing)} clips missing")
            continue
        build_page(lesson, len(lessons))
        built += 1

    if not args.only and built == len(lessons):
        build_index(load_lessons())
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
