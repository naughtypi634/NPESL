#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 IPA / Phonics / Phenomena 三个网页应用抽成小程序可用的数据。

数据源是**已经构建好的页面**（`apps/ipa/index.html`、`apps/phonics/lessons/*.html`、
`apps/phenomena/*.html`）：逐词的起止时间只存在于这些页面里，直接读页面比重新
推导时间轴可靠。改内容仍然改源（`content/`、`apps/*/source/content/`），重跑网页
构建，再跑本脚本。

输出：`miniprogram/data/{ipa,phonics,phenomena}.js`（分包各自只打包自己那份）。
音频不复制，只记相对路径（`ipa/xxx.mp3`），由 `upload_audio.py` 传到云存储。

用法：
    python -I tools/miniprogram/build_data.py
    python -I tools/miniprogram/build_data.py --check     # 只校验，不写文件
"""

from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths  # noqa: E402

OUT = paths.MINIPROGRAM / "data"

CARD_RE = re.compile(
    r'<section class="card" data-sound="(?P<sound>[^"]*)" '
    r'data-sprite-f="(?P<sf>[^"]*)" data-sprite-m="(?P<sm>[^"]*)">(?P<body>.*?)</section>',
    re.S,
)
WORD_RE = re.compile(
    r'<button class="word"[^>]*?data-start-f="(?P<sf>[^"]*)"[^>]*?data-end-f="(?P<ef>[^"]*)"'
    r'[^>]*?data-start-m="(?P<sm>[^"]*)"[^>]*?data-end-m="(?P<em>[^"]*)"'
    r'[^>]*?aria-label="(?P<word>[^"]*)">(?P<label>.*?)</button>',
    re.S,
)
SENTENCE_RE = re.compile(
    r'<section class="sentence" data-start-f="(?P<sf>[^"]*)" data-end-f="(?P<ef>[^"]*)"'
    r' data-start-m="(?P<sm>[^"]*)" data-end-m="(?P<em>[^"]*)"[^>]*>(?P<body>.*?)</section>',
    re.S,
)
ROW_RE = re.compile(
    r'<div class="row"><button class="chunk"[^>]*?data-start-f="(?P<sf>[^"]*)"'
    r'[^>]*?data-end-f="(?P<ef>[^"]*)"[^>]*?data-start-m="(?P<sm>[^"]*)"'
    r'[^>]*?data-end-m="(?P<em>[^"]*)"[^>]*>(?P<text>.*?)</button>'
    r'<p class="zh">(?P<zh>.*?)</p></div>',
    re.S,
)
LINE_RE = re.compile(
    r'<button class="line" type="button" data-start-f="(?P<sf>[^"]*)" data-end-f="(?P<ef>[^"]*)"'
    r' data-start-m="(?P<sm>[^"]*)" data-end-m="(?P<em>[^"]*)"[^>]*>'
    r'<span class="txt">(?P<text>.*?)</span><span class="zh">(?P<zh>.*?)</span></button>',
    re.S,
)
TARGET_RE = re.compile(r'<div class="target">(?P<body>.*?)</div>', re.S)
RUBY_RE = re.compile(r"<ruby>(.*?)<rt>(.*?)</rt></ruby>", re.S)
SOUND_RE = re.compile(r'<span class="sound">(.*?)</span>', re.S)
TAG_RE = re.compile(r"<[^>]+>")


def unescape(text: str) -> str:
    return htmllib.unescape(TAG_RE.sub("", text)).strip()


def inline(markup: str) -> str:
    """行内片段：去标签、合空白，但**保留词间空格**。

    ruby / 高亮把一句话切成几段，段与段之间的空格就在片段两头；这里要是 strip，
    `tea <ruby>or</ruby> coffee` 就会变成 `teaor coffee`。
    """
    return re.sub(r"\s+", " ", htmllib.unescape(TAG_RE.sub("", markup)))


def trim_parts(parts: list) -> list:
    """整句首尾的空格去掉，中间的一律保留。"""
    if not parts:
        return parts
    parts[0][0] = parts[0][0].lstrip()
    parts[-1][0] = parts[-1][0].rstrip()
    return [p for p in parts if p[0]]


def rich(markup: str, hl_tag: str) -> list:
    """把 `s<u>ee</u>` 或 `fr<span class="sound">ee</span>` 变成段落数组。

    返回 [[文本, 是否高亮], ...]，小程序端按需上色，不必解析 HTML。
    """
    pattern = (
        re.compile(rf"<{hl_tag}>(.*?)</{hl_tag}>", re.S)
        if hl_tag == "u"
        else SOUND_RE
    )
    parts: list = []
    pos = 0
    for m in pattern.finditer(markup):
        before = inline(markup[pos:m.start()])
        if before:
            parts.append([before, 0])
        hit = inline(m.group(1))
        if hit:
            parts.append([hit, 1])
        pos = m.end()
    tail = inline(markup[pos:])
    if tail:
        parts.append([tail, 0])
    return trim_parts(parts) or [["", 0]]


def ruby_parts(markup: str) -> list:
    """`<ruby>Your<rt>yer</rt></ruby> stop` -> [[文本, 读音或 0], ...]。"""
    parts: list = []
    pos = 0
    for m in RUBY_RE.finditer(markup):
        before = inline(markup[pos:m.start()])
        if before:
            parts.append([before, 0])
        parts.append([inline(m.group(1)), inline(m.group(2))])
        pos = m.end()
    tail = inline(markup[pos:])
    if tail:
        parts.append([tail, 0])
    return trim_parts(parts)


def audio_name(path: str) -> str:
    return path.rsplit("/", 1)[-1]


def sprite_map(markup: str, key: str) -> dict:
    m = re.search(
        rf'<script id="{key}" type="application/json">(.*?)</script>', markup, re.S
    )
    if not m:
        raise SystemExit(f"页面缺少 {key}")
    data = json.loads(m.group(1))
    return {"f": audio_name(data["f"]), "m": audio_name(data["m"])}


# ------------------------------------------------------------------ IPA
def build_ipa() -> dict:
    page = (paths.IPA_APP / "index.html").read_text(encoding="utf-8")
    main = page.split("<main>", 1)[1].split("</main>", 1)[0]

    groups = []
    chunks = re.split(r'<section class="group" id="(?P<id>[^"]+)">', main)
    # re.split 把 id 和内容交替切开：['', id1, body1, id2, body2, ...]
    for i in range(1, len(chunks), 2):
        gid, body = chunks[i], chunks[i + 1]
        title = unescape(re.search(r"<h2>(.*?)</h2>", body, re.S).group(1))
        note_m = re.search(r'<p class="group-note">(.*?)</p>', body, re.S)
        group = {"id": gid, "title": title}
        if note_m:
            group["note"] = unescape(note_m.group(1))

        cards = []
        pairs = []
        pair_chunks = re.split(r'<div class="pair">', body)[1:] if gid == "pairs" else [body]
        for pair_i, pair_body in enumerate(pair_chunks):
            pair = {"i": pair_i, "cards": []}
            tags = {}
            if gid == "pairs":
                pair["title"] = unescape(
                    re.search(r'<span class="pair-title">(.*?)</span>', pair_body, re.S).group(1)
                )
                note_m2 = re.search(r'<p class="pair-note">(.*?)</p>', pair_body, re.S)
                if note_m2:
                    pair["note"] = unescape(note_m2.group(1))
                tags = {
                    unescape(m.group(1)): unescape(m.group(2))
                    for m in re.finditer(
                        r'(/[^<]+/)<span class="tag [^"]+">([^<]+)</span>', pair_body, re.S
                    )
                }
            for card in CARD_RE.finditer(pair_body):
                sound = unescape(card.group("sound"))
                hint_m = re.search(r'<p class="hint">(.*?)</p>', card.group("body"), re.S)
                words = []
                for w in WORD_RE.finditer(card.group("body")):
                    words.append(
                        {
                            "w": unescape(w.group("word")),
                            "p": rich(w.group("label"), "u"),
                            "f": [float(w.group("sf")), float(w.group("ef"))],
                            "m": [float(w.group("sm")), float(w.group("em"))],
                        }
                    )
                card_obj = {
                    "sound": sound,
                    "sprite": {
                        "f": audio_name(card.group("sf")),
                        "m": audio_name(card.group("sm")),
                    },
                    "words": words,
                }
                if sound in tags:
                    card_obj["tag"] = tags[sound]
                if hint_m:
                    card_obj["hint"] = unescape(hint_m.group(1))
                pair["cards"].append(card_obj)
            pairs.append(pair)
        group["pairs"] = pairs
        groups.append(group)
    return {"groups": groups}


# ------------------------------------------------------------------ Phonics
LESSON_META_RE = re.compile(
    r'<span class="phoneme">(?P<ipa>.*?)</span>\s*'
    r'<span class="patterns">(?P<patterns>.*?)</span>\s*</div>\s*'
    r"<h1>(?P<en>.*?)</h1>\s*<p class=\"title-zh\">(?P<zh>.*?)</p>",
    re.S,
)


def phonics_groups() -> tuple[list, dict]:
    """索引页的「元音 / 辅音」分组，按网页顺序；返回分组列表和 课号→组名 的映射。"""
    page = (paths.PHONICS_APP / "index.html").read_text(encoding="utf-8")
    groups, by_num = [], {}
    parts = re.split(r"<h2>([^<]+)</h2>", page)
    for i in range(1, len(parts), 2):
        title, body = unescape(parts[i]), parts[i + 1]
        nums = [int(n) for n in re.findall(r'href="lessons/(\d+)-', body)]
        groups.append({"title": title, "nums": nums})
        for n in nums:
            by_num[n] = title
    return groups, by_num


def build_phonics() -> dict:
    groups, by_num = phonics_groups()
    lessons = []
    for path in sorted(paths.PHONICS_APP.joinpath("lessons").glob("*.html")):
        page = path.read_text(encoding="utf-8")
        meta = LESSON_META_RE.search(page)
        if not meta:
            raise SystemExit(f"{path.name}: 找不到课头信息")
        num = int(path.name.split("-", 1)[0])

        passage = page.split('class="passage"', 1)[1].split("</main>", 1)[0]
        sentences = []
        for si, s in enumerate(SENTENCE_RE.finditer(passage)):
            rows = []
            for ri, r in enumerate(ROW_RE.finditer(s.group("body"))):
                rows.append(
                    {
                        "i": f"{si}-{ri}",
                        "t": rich(r.group("text"), ""),
                        "zh": unescape(r.group("zh")),
                        "f": [float(r.group("sf")), float(r.group("ef"))],
                        "m": [float(r.group("sm")), float(r.group("em"))],
                    }
                )
            sentences.append(
                {
                    "i": si,
                    "rows": rows,
                    "f": [float(s.group("sf")), float(s.group("ef"))],
                    "m": [float(s.group("sm")), float(s.group("em"))],
                }
            )
        lessons.append(
            {
                "num": num,
                "group": by_num.get(num, ""),
                "ipa": unescape(meta.group("ipa")),
                "patterns": unescape(meta.group("patterns")),
                "en": unescape(meta.group("en")),
                "zh": unescape(meta.group("zh")),
                "sprite": sprite_map(page, "audioMap"),
                "sentences": sentences,
            }
        )
    return {"groups": groups, "lessons": lessons}


# ------------------------------------------------------------------ Phenomena
NUM_ZH = {
    "弱读": "弱读",
}


def build_phenomena() -> dict:
    chapters = []
    for path in sorted(paths.PHENOMENA_APP.glob("[0-9][0-9]-*.html")):
        page = path.read_text(encoding="utf-8")
        num = int(path.name.split("-", 1)[0])
        head = page.split("<header>", 1)[1].split("</header>", 1)[0]
        kind = unescape(re.search(r'<p class="num">(.*?)</p>', head, re.S).group(1)) if '<p class="num">' in head else ""
        title_en = unescape(re.search(r"<h1>(.*?)</h1>", head, re.S).group(1))
        title_zh = unescape(re.search(r'<p class="title-zh">(.*?)</p>', head, re.S).group(1))

        targets = []
        tblock = page.split('class="targets"', 1)[1].split("</section>", 1)[0] if 'class="targets"' in page else ""
        for ti, t in enumerate(TARGET_RE.finditer(tblock)):
            body = t.group("body")
            pair = re.search(
                r'<span class="w">(.*?)</span><span class="arrow">.*?</span><span class="s">(.*?)</span>',
                body,
                re.S,
            )
            pill = re.search(
                r'<button class="pill"[^>]*?data-start-f="([^"]*)"[^>]*?data-end-f="([^"]*)"'
                r'[^>]*?data-start-m="([^"]*)"[^>]*?data-end-m="([^"]*)"[^>]*>(.*?)</button>',
                body,
                re.S,
            )
            if not pair or not pill:
                continue
            demo = pill.group(5)
            demo = re.sub(r'<span class="play">.*?</span>', "", demo, flags=re.S)
            targets.append(
                {
                    "i": ti,
                    "written": unescape(pair.group(1)),
                    "spoken": unescape(pair.group(2)),
                    "demo": ruby_parts(demo),
                    "f": [float(pill.group(1)), float(pill.group(2))],
                    "m": [float(pill.group(3)), float(pill.group(4))],
                }
            )

        lines = []
        for li, l in enumerate(LINE_RE.finditer(page)):
            lines.append(
                {
                    "i": li,
                    "t": ruby_parts(l.group("text")),
                    "zh": unescape(l.group("zh")),
                    "f": [float(l.group("sf")), float(l.group("ef"))],
                    "m": [float(l.group("sm")), float(l.group("em"))],
                }
            )
        chapters.append(
            {
                "num": num,
                "kind": kind,
                "en": title_en,
                "zh": title_zh,
                "sprite": sprite_map(page, "spriteMap"),
                "targets": targets,
                "lines": lines,
            }
        )
    return {"groups": phenomena_groups(), "chapters": chapters}


INDEX_ROW_RE = re.compile(
    r'<a class="row" href="(?P<num>\d+)-[^"]*">'
    r'<span class="title"><span class="en">(?P<en>.*?)</span><span class="zh">(?P<zh>.*?)</span></span>'
    r'(?:<span class="tag">(?P<tag>.*?)</span>)?',
    re.S,
)


def phenomena_groups() -> list:
    """索引页的分类（弱读 / 缩合 / 吞音 / 变音 / 省略）与顺序以网页为准。"""
    page = (paths.PHENOMENA_APP / "index.html").read_text(encoding="utf-8")
    groups = []
    parts = re.split(r'<section class="group" data-cat="([^"]+)">', page)
    for i in range(1, len(parts), 2):
        title, body = unescape(parts[i]), parts[i + 1]
        chapters = []
        for row in INDEX_ROW_RE.finditer(body):
            item = {
                "num": int(row.group("num")),
                "en": unescape(row.group("en")),
                "zh": unescape(row.group("zh")),
            }
            if row.group("tag"):
                item["tag"] = unescape(row.group("tag"))
            chapters.append(item)
        groups.append({"title": title, "chapters": chapters})
    return groups


def dump(module: str, data: dict) -> str:
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"module.exports={body}\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只统计，不写文件")
    args = ap.parse_args()

    ipa = build_ipa()
    phonics = build_phonics()
    phen = build_phenomena()

    ipa_cards = sum(len(p["cards"]) for g in ipa["groups"] for p in g["pairs"])
    ph_sent = sum(len(l["sentences"]) for l in phonics["lessons"])
    print(f"IPA        {len(ipa['groups'])} 组 / {ipa_cards} 个音标")
    print(f"Phonics    {len(phonics['lessons'])} 课 / {ph_sent} 句")
    print(f"Phenomena  {len(phen['chapters'])} 章 / {sum(len(c['lines']) for c in phen['chapters'])} 行")

    if args.check:
        return

    OUT.mkdir(parents=True, exist_ok=True)
    files = {
        "ipa.js": dump("ipa", ipa),
        "phonics.js": dump("phonics", phonics),
        "phenomena.js": dump("phenomena", phen),
    }
    for name, text in files.items():
        (OUT / name).write_text(text, encoding="utf-8")
    for name in files:
        size = (OUT / name).stat().st_size
        print(f"wrote {name:<14}{size/1024:8.1f} KB")


if __name__ == "__main__":
    main()
