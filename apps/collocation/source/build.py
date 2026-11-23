# -*- coding: utf-8 -*-
"""Build the collocation app: one index page, one sprite per theme.

Source of truth is content/collocation/ — themes.json plus one <theme>.json per
theme. Clips are content-addressed, so re-running only synthesizes what is
new; the index never references master clips, only the concatenated sprites.
Entry details expand inline, so there are no per-theme pages.

    python -I apps/collocation/source/build.py
    python -I apps/collocation/source/build.py --skip-audio
"""

import argparse
import asyncio
import hashlib
import html
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
from urllib.parse import quote

ROOT = pathlib.Path(__file__).resolve().parents[3]
CONTENT = ROOT / "content" / "collocation"
BASE = ROOT / "apps" / "collocation"
AUDIO_DIR = BASE / "audio"

sys.path.insert(0, str(ROOT / "tools"))
import audio_sprite  # noqa: E402

import edge_tts  # noqa: E402

import azure_speech  # noqa: E402

VOICES = {
    "f": {"tts": "en-US-AvaNeural", "label": "女声"},
    "m": {"tts": "en-US-AndrewNeural", "label": "男声"},
}
RATE = "+0%"

# 一条 sprite 覆盖 8 个词条：点读时只下一小段，页面再按视口提前预热。
CHUNK_ENTRIES = 8

REGISTER_ZH = {"spoken": "口语", "neutral": "中性", "written": "书面"}
KIND_ZH = {"phrasal": "短语动词", "prep": "介词搭配", "idiom": "习语"}


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def clip_rel(text, voice, rate=RATE):
    text = " ".join(text.split())
    if not text:
        return ""
    key = f"{text}|{voice}|{rate}"
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]
    return f"{voice}/{digest[:2]}/{digest}.mp3"


def load_themes():
    doc = json.loads((CONTENT / "themes.json").read_text(encoding="utf-8"))
    themes = doc["themes"]
    for theme in themes:
        path = CONTENT / f"{theme['id']}.json"
        if path.exists():
            theme["entries"] = json.loads(
                path.read_text(encoding="utf-8")).get("entries", [])
        else:
            theme["entries"] = []
        # 主题内按使用频率从高到低；同分保持源文件顺序（Python 排序稳定）。
        theme["entries"].sort(key=lambda entry: -int(entry.get("freq", 3)))
    return themes


def load_opposites():
    path = CONTENT / "opposites.json"
    if not path.exists():
        return {"pairs": [], "word_opposites": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def opposite_maps(themes, numbers):
    """Resolve opposites.json into page-aware targets and word hints.

    Returns (links, words, by_id):
      links[id] = [{"id", "head", "zh", "page"}, ...]   # clickable entries
      words[id] = [{"word", "zh", "sense"}, ...]        # display-only words
      by_id[id] = {"id", "head", "zh", "page", "theme"}
    """
    doc = load_opposites()
    by_id = {}
    for theme in themes:
        page = f"{numbers[theme['id']]:02d}-{slug(theme['title_en'])}"
        for entry in theme["entries"]:
            by_id[entry["id"]] = {
                "id": entry["id"], "head": entry["head"], "zh": entry["zh"],
                "page": page, "theme": theme["id"],
            }

    links: dict[str, list] = {}
    for pair in doc.get("pairs", []):
        if not isinstance(pair, list) or len(pair) != 2:
            continue
        left, right = pair
        if left not in by_id or right not in by_id:
            print(f"warn: opposites.json 跳过未知 id：{left} / {right}", file=sys.stderr)
            continue
        links.setdefault(left, []).append(by_id[right])
        links.setdefault(right, []).append(by_id[left])
    words = {
        key: value
        for key, value in (doc.get("word_opposites") or {}).items()
        if key in by_id
    }
    return links, words, by_id


def entry_texts(entry):
    """Every spoken string for one entry, in reading order."""
    texts = [entry["head"]]
    for sense in entry.get("senses", []):
        en = (sense.get("example") or {}).get("en", "").strip()
        if en:
            texts.append(en)
    for variant in entry.get("variants", []):
        head = str(variant.get("head", "")).strip()
        if head:
            texts.append(head)
        en = (variant.get("example") or {}).get("en", "").strip()
        if en:
            texts.append(en)
    for use in entry.get("uses", []):
        head = str(use.get("head", "")).strip()
        if head:
            texts.append(head)
        en = (use.get("example") or {}).get("en", "").strip()
        if en:
            texts.append(en)
    return texts


def chapter_jobs(chapter):
    jobs = []
    for entry in chapter["entries"]:
        for text in entry_texts(entry):
            for voice in VOICES:
                rel = clip_rel(text, voice)
                if rel:
                    jobs.append((rel, text, voice))
    return jobs


async def synthesize(text, voice, semaphore):
    async with semaphore:
        last = None
        for attempt in range(5):
            try:
                communicate = edge_tts.Communicate(text, VOICES[voice]["tts"], rate=RATE)
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


# 本地后端：模型和依赖在各自的 venv 里，构建脚本只负责投喂清单。
SIDECAR = {
    "kokoro": (pathlib.Path(os.environ.get(
        "KOKORO_PYTHON",
        ROOT / "build" / "tts-local" / "venv" / "Scripts" / "python.exe")),
        "kokoro_worker.py"),
    "qwen": (pathlib.Path(os.environ.get(
        "QWEN_PYTHON", r"F:\AIProject\tts-lab\.venv\Scripts\python.exe")),
        "qwen_worker.py"),
}


def sidecar_synth(missing, backend):
    """整批交给本地 venv 一次合成，模型只加载一次。"""
    python, worker = SIDECAR[backend]
    manifest = ROOT / "build" / "tts-local" / f"jobs-{backend}.json"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    payload = [{"out": str(AUDIO_DIR / rel), "text": text, "voice": voice}
               for rel, text, voice in missing]
    manifest.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    worker_path = pathlib.Path(__file__).parent / worker
    subprocess.run([str(python), str(worker_path), str(manifest)], check=True)
    return [rel for rel, _, _ in missing if not (AUDIO_DIR / rel).exists()]


async def ensure_clips(themes, backend="azure"):
    wanted = {}
    for theme in themes:
        for rel, text, voice in chapter_jobs(theme):
            wanted[rel] = (text, voice)
    missing = [(rel, text, voice) for rel, (text, voice) in wanted.items()
               if not (AUDIO_DIR / rel).exists()]
    print(f"audio: {len(wanted)} clips, {len(missing)} to synthesize ({backend})")
    if not missing:
        return []
    if backend in SIDECAR:
        failed = await asyncio.to_thread(sidecar_synth, missing, backend)
        print(f"audio: {'done' if not failed else f'{len(failed)} failed'}")
        return failed
    semaphore = asyncio.Semaphore(8)
    done = 0

    async def one(rel, text, voice):
        nonlocal done
        path = AUDIO_DIR / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if backend == "azure":
            data = await asyncio.to_thread(
                azure_speech.synthesize, text, VOICES[voice]["tts"], RATE)
        else:
            data = await synthesize(text, voice, semaphore)
        path.write_bytes(data)
        done += 1
        if done % 20 == 0 or done == len(missing):
            print(f"audio: {done}/{len(missing)}", flush=True)

    results = await asyncio.gather(
        *(one(*job) for job in missing), return_exceptions=True)
    failed = [job[0] for job, result in zip(missing, results)
              if isinstance(result, Exception)]
    if failed:
        print(f"audio: {len(failed)} failed: {failed[:5]}")
    else:
        print("audio: done")
    return failed


class ClipPlan:
    """Pass one: record which clips each playable element needs."""

    def __init__(self):
        self.items = []

    def attrs(self, text):
        self.items.append({v: clip_rel(text, v) for v in VOICES})
        return ""


class ClipCursor:
    """Pass two: hand out (start, end) offsets in the same order."""

    def __init__(self, spans):
        self.spans = spans
        self.index = 0

    def next_span(self):
        item = self.spans[self.index] if self.index < len(self.spans) else {}
        self.index += 1
        return item

    def attrs(self, text):
        item = self.next_span()
        parts = []
        for voice, span in item.items():
            if span:
                parts.append(f'data-start-{voice}="{span[0]:.3f}" '
                             f'data-end-{voice}="{span[1]:.3f}"')
        return " ".join(parts)


def build_sprites(plan):
    spans = [dict() for _ in plan.items]
    urls = {}
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
        # 名字带音频摘要：重录同一文本会改变字节，纯文本哈希的名字会让
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


INDEX_STYLE = (pathlib.Path(__file__).parent / "index_style.css").read_text(encoding="utf-8")


PARTICLE_ORDER = ["up", "down", "out", "off", "on", "in"]
PARTICLE_EXTRA = ["through", "over", "back", "around", "into", "onto", "away",
                  "along", "by", "for", "with", "at", "ahead", "together",
                  "after", "apart", "across", "forward", "behind", "past",
                  "against", "about", "of", "aside", "under", "round", "from", "to"]
REAL_PARTICLES = set(PARTICLE_ORDER + PARTICLE_EXTRA)


def theme_audio(theme):
    """按每 8 个词条一组拼 sprite，返回 (chunks, entry_chunk, spans)。

    chunks[k-1] 是第 k 组的女/男 sprite；entry_chunk 记录词条属于哪一组；
    spans 里每个偏移都相对本组 sprite 的起点。词条不跨组切断。
    """
    chunks = []
    entry_chunk = {}
    spans = {}
    entries = theme["entries"]
    for start in range(0, len(entries), CHUNK_ENTRIES):
        block = entries[start:start + CHUNK_ENTRIES]
        plan = ClipPlan()
        for entry in block:
            for text in entry_texts(entry):
                plan.attrs(text)
        cursor, urls = build_sprites(plan)
        chunks.append(urls)
        chunk_no = len(chunks)
        for entry in block:
            entry_chunk[entry["id"]] = chunk_no
            items = []
            for _ in entry_texts(entry):
                item = cursor.next_span()
                female = item.get("f")
                male = item.get("m")
                items.append([female[0], female[1], male[0], male[1]]
                             if female and male else None)
            spans[entry["id"]] = items
    return chunks, entry_chunk, spans


def index_data(themes, opp_map=None, word_map=None):
    """整站数据一次写进 data.js（本地 file:// 打开时不能靠 fetch）。"""
    doc = json.loads((CONTENT / "themes.json").read_text(encoding="utf-8"))
    categories = doc.get("categories", [])

    entries = []
    index_of = {}
    theme_rows = {}
    spr = []
    for theme in themes:
        chunks, entry_chunk, spans = theme_audio(theme)
        base = len(spr)
        spr.extend(chunks)
        rows = []
        for entry in theme["entries"]:
            index_of[(theme["id"], entry["id"])] = len(entries)
            rows.append(len(entries))
            senses = entry.get("senses", [])
            spoken_senses = sum(
                1 for sense in senses
                if (sense.get("example") or {}).get("en", "").strip())
            var_rows = []
            for vindex, variant in enumerate(entry.get("variants", [])):
                example = variant.get("example") or {}
                head_k = 1 + spoken_senses + 2 * vindex
                var_rows.append([
                    variant.get("head", ""), variant.get("ipa", ""),
                    variant.get("zh", ""), variant.get("register", ""),
                    example.get("en", ""), example.get("zh", ""),
                    variant.get("note_zh", ""), head_k, head_k + 1,
                ])
            use_rows = []
            use_base = 1 + spoken_senses + 2 * len(entry.get("variants", []))
            for uindex, use in enumerate(entry.get("uses", [])):
                example = use.get("example") or {}
                head_k = use_base + 2 * uindex
                use_rows.append([
                    use.get("head", ""), use.get("zh", ""),
                    example.get("en", ""), example.get("zh", ""),
                    head_k, head_k + 1,
                ])
            entries.append({
                "id": entry["id"], "c": theme.get("category", ""), "t": theme["id"],
                "h": entry["head"], "zh": entry["zh"],
                "ipa": entry.get("ipa", ""),
                "kind": entry.get("kind", "phrasal"),
                "reg": entry.get("register", ""),
                "sep": entry.get("separable", False),
                "freq": int(entry.get("freq", 3)),
                "sen": [[s["zh"], s["example"]["en"], s["example"]["zh"]]
                        for s in senses],
                "var": var_rows,
                "use": use_rows,
                "l1": entry.get("l1_note", ""),
                "coll": [],
                "conf": [],
                "opp": [], "wo": [],
                "sp": base + entry_chunk[entry["id"]],
                "au": spans.get(entry["id"], []),
            })
        theme_rows[theme["id"]] = rows

    # 搭配/易混补中文：搭配读 collocations_zh；易混按 head 反查词条释义
    by_head = {}
    for theme in themes:
        for entry in theme["entries"]:
            by_head[entry["head"].lower()] = entry["zh"]
    for theme in themes:
        for entry in theme["entries"]:
            idx = index_of[(theme["id"], entry["id"])]
            coll_zh = entry.get("collocations_zh") or []
            entries[idx]["coll"] = [
                [text, coll_zh[i] if i < len(coll_zh) else ""]
                for i, text in enumerate(entry.get("collocations", []))
            ]
            entries[idx]["conf"] = [
                [name, by_head.get(name.lower(), "")]
                for name in entry.get("confusables", [])
            ]

    by_entry_id = {
        entry["id"]: index_of[(theme["id"], entry["id"])]
        for theme in themes for entry in theme["entries"]
    }
    for theme in themes:
        for entry in theme["entries"]:
            idx = index_of[(theme["id"], entry["id"])]
            targets = []
            for target in (opp_map or {}).get(entry["id"], []):
                target_index = by_entry_id.get(target["id"])
                if target_index is not None:
                    targets.append({
                        "i": target_index, "h": target["head"], "zh": target["zh"],
                    })
            entries[idx]["opp"] = targets
            entries[idx]["wo"] = [
                [item.get("sense"), item.get("word"), item.get("zh")]
                for item in (word_map or {}).get(entry["id"], [])
            ]

    scene = []
    for cat in categories:
        group = [t for t in themes if t.get("category") == cat["id"]]
        if not group:
            continue
        scene.append({
            "id": cat["id"], "zh": cat["title_zh"], "en": cat["title_en"],
            "themes": [{"id": t["id"], "zh": t["title_zh"], "en": t["title_en"],
                        "rows": theme_rows[t["id"]]} for t in group],
        })

    bucketed: dict[str, list] = {}
    others: list = []
    for theme in themes:
        for entry in theme["entries"]:
            if entry.get("kind") == "chunk":
                continue
            idx = index_of[(theme["id"], entry["id"])]
            if entry["particle"] in REAL_PARTICLES:
                bucketed.setdefault(entry["particle"], []).append(idx)
            else:
                others.append(idx)
    keys = [x for x in PARTICLE_ORDER if x in bucketed]
    keys += [x for x in PARTICLE_EXTRA if x in bucketed]
    particle = [{"p": x, "rows": bucketed[x]} for x in keys]
    if others:
        particle.append({"p": "others", "label": "其他", "rows": others})

    return {"spr": spr, "scene": scene, "particle": particle, "entries": entries}


def build_index(themes, opp_map=None, word_map=None):
    data = index_data(themes, opp_map, word_map)
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()[:10]
    for old in BASE.glob("data.*.js"):
        if old.name != f"data.{digest}.js":
            old.unlink()
    (BASE / f"data.{digest}.js").write_text(
        "window.COLLOCATION_INDEX=" + payload + ";\n", encoding="utf-8")

    source = pathlib.Path(__file__).parent
    style = (source / "index_style.css").read_text(encoding="utf-8")
    script = (source / "index_script.js").read_text(encoding="utf-8")
    page = (
        '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        "<title>短语搭配 Collocations</title>\n"
        f"<style>{style}</style>\n</head>\n<body>\n<div class=\"page\">\n"
        "<h1>短语搭配</h1>\n"
        '<div class="searchbar">'
        '<input id="q" type="search" placeholder="搜索短语或中文释义" '
        'aria-label="搜索短语搭配" autocomplete="off">'
        '<kbd aria-hidden="true">/</kbd>'
        '<button class="clear" id="qclear" type="button" hidden>清除</button>'
        '</div>\n'
        '<div class="topbar">'
        '<div class="level1" role="group" aria-label="浏览方式">'
        '<button type="button" data-mode="scene" aria-pressed="true">场景话题'
        '<span class="mode-arw" aria-hidden="true">›</span></button>'
        '<button type="button" data-mode="particle" aria-pressed="false">介词'
        '<span class="mode-arw" aria-hidden="true">›</span></button>'
        '</div>'
        '<div class="seg" role="group" aria-label="音色">'
        '<span class="voice-ico" aria-hidden="true"><svg viewBox="0 0 24 24" '
        'width="14" height="14" fill="none" '
        'stroke="currentColor" stroke-width="2" stroke-linejoin="round">'
        '<path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16 8a5 5 0 0 1 0 8"/>'
        '</svg></span>'
        '<button type="button" data-voice="f" aria-pressed="true">女声</button>'
        '<button type="button" data-voice="m" aria-pressed="false">男声</button>'
        '</div></div>\n'
        '<div class="histbar" id="histbar" hidden>'
        '<button type="button" id="histback">‹ 返回原词</button></div>\n'
        '<div class="chips" data-chips="scene"></div>\n'
        '<div class="chips" data-chips="particle" hidden></div>\n'
        '<div class="chips" data-chips="theme" hidden></div>\n'
        '<div id="view"></div>\n'
        '<div class="sr-only" id="live" role="status" aria-live="polite"></div>\n'
        '</div>\n'
        f'<script src="data.{digest}.js"></script>\n'
        f"<script>\n{script}\n</script>\n"
        '<script src="scroll-progress.js" defer></script>\n</body>\n</html>\n'
    )
    (BASE / "index.html").write_text(page, encoding="utf-8")
    total = len(data["entries"])
    print(f"built index.html + data.{digest}.js ({len(themes)} themes, {total} entries)")


async def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-audio", action="store_true")
    parser.add_argument("--keep-sprites", action="store_true",
                        help="本地预览时保留旧 sprite，避免反复重拼")
    parser.add_argument("--tts", choices=["azure", "edge", "kokoro", "qwen"],
                        default="azure",
                        help="合成后端：azure（默认）/ edge / kokoro（本地 ONNX）"
                             " / qwen（本地 Qwen3-TTS，需 tts-lab 环境）")
    args = parser.parse_args()

    themes = load_themes()
    numbers = {theme["id"]: index + 1 for index, theme in enumerate(themes)}
    opp_map, word_map, _ = opposite_maps(themes, numbers)

    # 不管有没有 --skip-audio 都清掉旧 sprite：分片后旧的整主题
    # sprite 不会再被引用，留着只会被一起部署。
    sprites = AUDIO_DIR / "sprites"
    if sprites.exists() and not args.keep_sprites:
        shutil.rmtree(sprites)
    if not args.skip_audio:
        failed = await ensure_clips(themes, args.tts)
    else:
        failed = []

    missing = sum(
        1 for theme in themes for rel, _, _ in chapter_jobs(theme)
        if not (AUDIO_DIR / rel).exists()
    )
    if missing:
        print(f"警告：{missing} 条音频缺失，相关词条暂不播放")

    # 章节页已并入索引页；清掉旧构建留下的独立页面。
    for path in BASE.glob("[0-9][0-9]-*.html"):
        path.unlink()

    build_index(themes, opp_map, word_map)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
