#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""美式英语音标表 -> NPESL 网页版。

源：01-零基础入门/MD/基础课30/Pronunciation音标表.md
    40 个音标 × 10 个单词，单词里用 ** 标出该音标的拼写字母。

音频：先从已发布的 06-发音/Pronunciation音标表.pdf 抽出内嵌录音。
    那份 PDF 每个单词带一块 Screen 注记，注记的 Rendition 里内嵌
    `voice-word.mp3`（10 个声音按顺序交替），网页和 PDF 听到的是同一批录音。
    每个单词在 PDF 里只有一版声音；页面要「女声 / 男声」切换，所以
    再用同一套 Edge TTS（Andrew / Ava，语速 -10%）补齐另一性别，
    新文件命名 `andrew-word.mp3` / `ava-word.mp3`，已有的不重做。
    注记顺序与 MD 表格逐行一致（400 条），脚本会核对。

输出：06-发音/音标表/index.html + audio/*.mp3
    页面自带返回按钮和主题切换（主题样式直接内联自 06-发音/网站/），
    所以本地直接打开也完整；组装站点时 build_cloudflare_site.py 和
    build_offline_package.py 看到内联标记就不再重复注入。

用法：
    python -I build/build_ipa_site.py
"""

from __future__ import annotations

import asyncio
import html
import io
import re
from contextlib import redirect_stdout
from pathlib import Path

import edge_tts
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "01-零基础入门" / "MD" / "基础课30" / "Pronunciation音标表.md"
AUDIO_PDF = ROOT / "06-发音" / "Pronunciation音标表.pdf"
OUT_DIR = ROOT / "06-发音" / "音标表"
AUDIO_DIR = OUT_DIR / "audio"
OUT_PAGE = OUT_DIR / "index.html"

SITE_DIR = ROOT / "06-发音" / "网站"
THEME_CSS = SITE_DIR / "theme.css"
THEME_JS = SITE_DIR / "theme.js"

MALE_VOICES = {"andrew", "brian", "christopher", "eric", "guy"}
FEMALE_VOICES = {"ava", "emma", "aria", "jenny", "michelle"}
MALE_TTS = "en-US-AndrewNeural"
FEMALE_TTS = "en-US-AvaNeural"
RATE = "-10%"

# ---------------------------------------------------------------- 分类
MONOPHTHONGS = ["/i/", "/ɪ/", "/ɛ/", "/æ/", "/ɑ/", "/ʌ/", "/ɔ/", "/ʊ/", "/u/",
                "/ɜr/", "/ər/"]
DIPHTHONGS = ["/eɪ/", "/oʊ/", "/aɪ/", "/aʊ/", "/ɔɪ/"]

# 清浊成对：口型相同，只差声带振动。左右顺序 = 清 / 浊。
CONSONANT_PAIRS = [
    ("/p/", "/b/", "爆破音"),
    ("/t/", "/d/", "爆破音"),
    ("/k/", "/g/", "爆破音"),
    ("/f/", "/v/", "摩擦音"),
    ("/θ/", "/ð/", "摩擦音"),
    ("/s/", "/z/", "摩擦音"),
    ("/ʃ/", "/ʒ/", "摩擦音"),
    ("/tʃ/", "/dʒ/", "破擦音"),
]
# 英语里没有清浊配对的辅音。/h/ 是清辅音，其余都是浊辅音。
OTHER_CONSONANTS = ["/h/", "/m/", "/n/", "/ŋ/", "/l/", "/r/", "/w/", "/j/"]

VOICELESS = [voiceless for voiceless, _voiced, _manner in CONSONANT_PAIRS] + ["/h/"]
VOICED = [voiced for _voiceless, voiced, _manner in CONSONANT_PAIRS] + [
    "/m/", "/n/", "/ŋ/", "/l/", "/r/", "/w/", "/j/",
]

SECTIONS = [
    ("monophthongs", "单元音"),
    ("diphthongs", "双元音"),
    ("pairs", "清浊对比"),
    ("other", "其他辅音"),
]

MANNER = {
    "/p/": "爆破音", "/b/": "爆破音", "/t/": "爆破音", "/d/": "爆破音",
    "/k/": "爆破音", "/g/": "爆破音",
    "/f/": "摩擦音", "/v/": "摩擦音", "/θ/": "摩擦音", "/ð/": "摩擦音",
    "/s/": "摩擦音", "/z/": "摩擦音", "/ʃ/": "摩擦音", "/ʒ/": "摩擦音",
    "/h/": "摩擦音",
    "/tʃ/": "破擦音", "/dʒ/": "破擦音",
    "/m/": "鼻音", "/n/": "鼻音", "/ŋ/": "鼻音",
    "/l/": "流音", "/r/": "流音",
    "/w/": "半元音", "/j/": "半元音",
}

HINTS = {
    "/ŋ/": "像使劲拧瓶盖时发出的声音",
}

# 成对辅音的提示放在整对上面，两张卡片的单词行才能对齐。
PAIR_NOTES = {
    ("/f/", "/v/"): "模仿兔子牙：上牙轻咬下唇；/f/ 声带不振动，/v/ 声带振动",
    ("/ʃ/", "/ʒ/"): "像「嘘 🤫」：/ʃ/ 只有气息，/ʒ/ 在 /ʃ/ 的基础上让声带振动",
}


def parse_source() -> list[tuple[str, list[str]]]:
    """Return [(sound, [marked words...])] in the PDF's order."""
    groups: list[tuple[str, list[str]]] = []
    for line in SOURCE.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) != 2 or not cells[0].startswith("/"):
            continue
        sound, word = cells
        if groups and groups[-1][0] == sound:
            groups[-1][1].append(word)
        else:
            groups.append((sound, [word]))
    if len(groups) != 40 or any(len(words) != 10 for _, words in groups):
        raise SystemExit(
            f"源文件不是 40 个音标 × 10 个单词："
            f"{len(groups)} 组，{sum(len(w) for _, w in groups)} 词"
        )
    sounds = [sound for sound, _ in groups]
    expected = MONOPHTHONGS + DIPHTHONGS + VOICELESS + VOICED
    if sorted(sounds) != sorted(expected):
        raise SystemExit("音标分类表和源文件对不上，先核对 SECTIONS 常量")
    return groups


def strip_marks(marked: str) -> str:
    return marked.replace("**", "")


def render_word(marked: str) -> str:
    """Turn `s**ee**` into escaped HTML with the target letters underlined."""
    parts = re.split(r"(\*\*.*?\*\*)", marked)
    out = []
    for part in parts:
        if part.startswith("**") and part.endswith("**") and len(part) >= 4:
            out.append(f"<u>{html.escape(part[2:-2])}</u>")
        else:
            out.append(html.escape(part))
    return "".join(out)


def extract_audio() -> list[str]:
    """Copy every embedded clip out of the published PDF, in page order."""
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    pymupdf.TOOLS.mupdf_display_errors(False)
    clips: list[str] = []
    # 注记处理时 MuPDF 会尝试为 Screen 注记生成外观流并报错，
    # 不影响读取，统一吞掉这些底层输出。
    with redirect_stdout(io.StringIO()):
        doc = pymupdf.open(AUDIO_PDF)
        for page in doc:
            for annot in page.annots() or []:
                action = int(doc.xref_get_key(annot.xref, "A")[1].split()[0])
                rendition = int(doc.xref_get_key(action, "R")[1].split()[0])
                clip = int(doc.xref_get_key(rendition, "C")[1].split()[0])
                spec = int(doc.xref_get_key(clip, "EF")[1].split()[0])
                name = re.search(r"/UF \((.*?)\)", doc.xref_object(spec)).group(1)
                stream = int(re.search(
                    r"/F (\d+) 0 R", doc.xref_get_key(spec, "EF")[1]
                ).group(1))
                (AUDIO_DIR / name).write_bytes(doc.xref_stream(stream))
                clips.append(name)
    return clips


# ---------------------------------------------------------------- 男女双版本
def voice_gender(filename: str) -> str:
    prefix = filename.split("-", 1)[0]
    if prefix in MALE_VOICES:
        return "m"
    if prefix in FEMALE_VOICES:
        return "f"
    raise SystemExit(f"认不出声音：{filename}")


async def synthesize(text: str, voice: str) -> bytes:
    communicate = edge_tts.Communicate(text, voice, rate=RATE)
    chunks = [
        chunk["data"]
        async for chunk in communicate.stream()
        if chunk["type"] == "audio"
    ]
    audio = b"".join(chunks)
    if not audio:
        raise RuntimeError("Edge TTS 没有返回音频")
    return audio


async def generate_audio(
    jobs: list[tuple[str, str, Path]],
    concurrency: int = 10,
) -> list[tuple[str, str]]:
    semaphore = asyncio.Semaphore(concurrency)
    failed: list[tuple[str, str]] = []
    done = 0
    total = len(jobs)

    async def one(gender: str, word: str, target: Path) -> None:
        nonlocal done
        voice = MALE_TTS if gender == "m" else FEMALE_TTS
        async with semaphore:
            last_error: Exception | None = None
            for attempt in range(1, 4):
                try:
                    audio = await asyncio.wait_for(
                        synthesize(word, voice), timeout=90
                    )
                    tmp = target.with_suffix(".mp3.part")
                    tmp.write_bytes(audio)
                    tmp.replace(target)
                    last_error = None
                    break
                except Exception as exc:       # 网络抖动、超时、服务限流
                    last_error = exc
                    if attempt < 3:
                        await asyncio.sleep(2 * attempt)
            await asyncio.sleep(0.15)
        done += 1
        if last_error is not None:
            failed.append((gender, word))
            print(f"  失败 {gender} {word} {last_error}")
        elif done % 25 == 0 or done == total:
            print(f"  补录音 {done:3}/{total}")

    await asyncio.gather(*(one(*job) for job in jobs))
    return failed


def build_voice_pairs(
    groups: list[tuple[str, list[str]]],
    clips: list[str],
) -> dict[str, dict[str, str]]:
    """word -> {"m": filename, "f": filename}，缺的用 Edge TTS 补齐。"""
    pairs: dict[str, dict[str, str]] = {}
    cursor = 0
    for _sound, words in groups:
        for marked in words:
            name = clips[cursor]
            cursor += 1
            key = strip_marks(marked).lower()
            pairs.setdefault(key, {})[voice_gender(name)] = name

    jobs: list[tuple[str, str, Path]] = []
    for key, pair in pairs.items():
        if "m" not in pair:
            target = f"andrew-{key}.mp3"
            pair["m"] = target
            path = AUDIO_DIR / target
            if not path.exists() or path.stat().st_size <= 500:
                jobs.append(("m", key, path))
        if "f" not in pair:
            target = f"ava-{key}.mp3"
            pair["f"] = target
            path = AUDIO_DIR / target
            if not path.exists() or path.stat().st_size <= 500:
                jobs.append(("f", key, path))

    if jobs:
        print(f"男女双版本：补 {len(jobs)} 条录音（已有 {len(pairs)} 个单词）")
        failed = asyncio.run(generate_audio(jobs))
        if failed:
            for gender, word in failed[:20]:
                print(f"  {gender}  {word}")
            raise SystemExit(f"{len(failed)} 条录音失败，重跑同一命令会只补缺失的")

    for key, pair in pairs.items():
        for gender in ("m", "f"):
            path = AUDIO_DIR / pair[gender]
            if not path.exists() or path.stat().st_size <= 500:
                raise SystemExit(f"音频缺失：{path}")
    return pairs


# ---------------------------------------------------------------- 页面
def sound_badge(sound: str) -> tuple[str, str]:
    if sound in MONOPHTHONGS:
        return "单元音", ""
    if sound in DIPHTHONGS:
        return "双元音", ""
    manner = MANNER[sound]
    if sound in VOICELESS:
        return f"{manner} · 清", " voiceless"
    return f"{manner} · 浊", " voiced"


def build_card(
    sound: str,
    words: list[str],
    pairs: dict[str, dict[str, str]],
) -> str:
    buttons = []
    for marked in words:
        plain = strip_marks(marked)
        pair = pairs[plain.lower()]
        buttons.append(
            f'<button class="word" type="button" lang="en" '
            f'data-audio-f="audio/{html.escape(pair["f"], quote=True)}" '
            f'data-audio-m="audio/{html.escape(pair["m"], quote=True)}" '
            f'aria-label="{html.escape(plain, quote=True)}">'
            f"{render_word(marked)}</button>"
        )
    badge, badge_class = sound_badge(sound)
    hint = HINTS.get(sound)
    hint_html = f'<p class="hint">{html.escape(hint)}</p>' if hint else ""
    sound_attr = html.escape(sound, quote=True)
    return (
        f'<section class="card" data-sound="{sound_attr}">\n'
        f'  <div class="card-head">\n'
        f'    <span class="ipa">{html.escape(sound)}</span>\n'
        f'    <span class="badge{badge_class}">{badge}</span>\n'
        f'    <div class="voice" role="group" '
        f'aria-label="{sound_attr} 的朗读声音">\n'
        f'      <button type="button" data-voice="f" '
        f'aria-pressed="true">女声</button>\n'
        f'      <button type="button" data-voice="m" '
        f'aria-pressed="false">男声</button>\n'
        f'    </div>\n'
        f'  </div>\n'
        f'  {hint_html}\n'
        f'  <div class="words">\n    '
        + "\n    ".join(buttons)
        + "\n  </div>\n</section>"
    )


def section_html(
    section_id: str,
    title: str,
    meta: str,
    inner: str,
    note: str = "",
) -> str:
    note_html = f'<p class="group-note">{html.escape(note)}</p>' if note else ""
    return (
        f'<section class="group" id="{section_id}">\n'
        f'  <div class="group-head">\n'
        f'    <h2>{title}</h2>\n'
        f'    <span class="group-meta">{meta}</span>\n'
        f'  </div>\n'
        f'  {note_html}\n'
        f'  {inner}\n'
        f'</section>'
    )


def build_pair(
    voiceless: str,
    voiced: str,
    manner: str,
    by_sound: dict[str, list[str]],
    pairs: dict[str, dict[str, str]],
) -> str:
    note = PAIR_NOTES.get((voiceless, voiced))
    note_html = f'<p class="pair-note">{html.escape(note)}</p>' if note else ""
    return (
        f'<div class="pair">\n'
        f'  <div class="pair-head">\n'
        f'    <span class="pair-title">{manner}</span>\n'
        f'    <span class="pair-path">{html.escape(voiceless)}'
        f'<span class="tag voiceless">清</span>'
        f'<span class="arrow">↔</span>{html.escape(voiced)}'
        f'<span class="tag voiced">浊</span></span>\n'
        f'  </div>\n'
        f'  {note_html}\n'
        f'  <div class="grid">\n'
        f'{build_card(voiceless, by_sound[voiceless], pairs)}\n'
        f'{build_card(voiced, by_sound[voiced], pairs)}\n'
        f'  </div>\n'
        f'</div>'
    )


def build_page(
    groups: list[tuple[str, list[str]]],
    pairs: dict[str, dict[str, str]],
) -> str:
    by_sound = dict(groups)
    sections = [
        section_html(
            "monophthongs", "单元音", f"{len(MONOPHTHONGS)} 个",
            '<div class="grid">\n'
            + "\n".join(build_card(s, by_sound[s], pairs) for s in MONOPHTHONGS)
            + "\n  </div>",
        ),
        section_html(
            "diphthongs", "双元音", f"{len(DIPHTHONGS)} 个",
            '<div class="grid">\n'
            + "\n".join(build_card(s, by_sound[s], pairs) for s in DIPHTHONGS)
            + "\n  </div>",
        ),
    ]

    pair_blocks = "\n".join(
        build_pair(voiceless, voiced, manner, by_sound, pairs)
        for voiceless, voiced, manner in CONSONANT_PAIRS
    )
    sections.append(
        section_html(
            "pairs", "清浊对比", f"{len(CONSONANT_PAIRS)} 对",
            f'<div class="pairs">\n{pair_blocks}\n  </div>',
            "每对辅音口型相同，只差声带振动。",
        )
    )
    sections.append(
        section_html(
            "other", "其他辅音", f"{len(OTHER_CONSONANTS)} 个",
            '<div class="grid">\n'
            + "\n".join(build_card(s, by_sound[s], pairs) for s in OTHER_CONSONANTS)
            + "\n  </div>",
            "英语里没有对应的清浊配对。",
        )
    )

    nav = "\n".join(
        f'      <a href="#{section_id}" data-target="{section_id}">{title}</a>'
        for section_id, title in SECTIONS
    )

    page = TEMPLATE.replace("<!--SECTIONS-->", "\n".join(sections))
    page = page.replace("<!--NAV-->", nav)
    page = page.replace("<!--THEME_CSS-->", THEME_CSS.read_text(encoding="utf-8"))
    page = page.replace("<!--THEME_JS-->", THEME_JS.read_text(encoding="utf-8"))
    return page


def main() -> int:
    groups = parse_source()
    clips = extract_audio()
    if len(clips) != sum(len(words) for _, words in groups):
        raise SystemExit(
            f"PDF 音频 {len(clips)} 条，源单词 "
            f"{sum(len(w) for _, w in groups)} 个"
        )

    # 音频文件名里带声音和单词，用来核对两份数据的顺序。
    doc = pymupdf.open(AUDIO_PDF)
    pdf_words = []
    with redirect_stdout(io.StringIO()):
        for page in doc:
            for annot in page.annots() or []:
                pdf_words.append(annot.info.get("content", "").strip())
    md_words = [strip_marks(w) for _, words in groups for w in words]
    if pdf_words != md_words:
        raise SystemExit("PDF 注记顺序与 MD 表格不一致，先核对源文件")

    pairs = build_voice_pairs(groups, clips)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with OUT_PAGE.open("w", encoding="utf-8", newline="") as fh:
        fh.write(build_page(groups, pairs))

    used = {name for pair in pairs.values() for name in pair.values()}
    total = sum((AUDIO_DIR / name).stat().st_size for name in used)
    print(f"页面：{OUT_PAGE.relative_to(ROOT)}")
    print(f"音频：{len(used)} 个文件，共 {total / 1024 / 1024:.1f} MB")
    return 0


TEMPLATE = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>美式英语音标表</title>
<script>try{var t=localStorage.getItem('npesl-theme');document.documentElement.setAttribute('data-theme',t&&['auto','bright','dark','sepia'].indexOf(t)>-1?t:'auto');}catch(e){document.documentElement.setAttribute('data-theme','auto');}</script>
<style>
  :root {
    --bg:#ffffff; --fg:#1d1d1f; --muted:#6e6e73; --rule:#e5e5ea;
    --surface:#f5f5f7; --surface-strong:#e8e8ed;
    --blue:#0071e3; --blue-tint:#e8f2ff; --on-blue:#ffffff;
    --rail:#e5e5ea; --icon:#515154;
    --font-ipa:"Lucida Sans Unicode","Arial Unicode MS","Charis SIL",
      "Doulos SIL","Segoe UI",sans-serif;
    --font:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display",
      "Segoe UI Variable","Segoe UI","PingFang SC","Hiragino Sans GB",
      "Microsoft YaHei",sans-serif;
    color-scheme:light;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg:#000000; --fg:#f5f5f7; --muted:#98989d; --rule:#38383a;
      --surface:#1c1c1e; --surface-strong:#2c2c2e;
      --blue:#2997ff; --blue-tint:#102a43; --on-blue:#ffffff;
      --rail:#2c2c2e; --icon:#98989d;
      color-scheme:dark;
    }
  }
  * { box-sizing:border-box; }
  html { scroll-behavior:smooth; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior:auto; } }
  body { margin:0; background:var(--bg); color:var(--fg); font-family:var(--font);
    -webkit-font-smoothing:antialiased; }
  .page { max-width:980px; margin:0 auto;
    padding:clamp(32px,6vh,64px) max(24px,env(safe-area-inset-left,0px)) 120px;
    padding-right:max(24px,env(safe-area-inset-right,0px)); }
  .page > .npesl-back { position:static; margin-bottom:20px; }

  h1 { margin:0; font-size:clamp(2rem,5.4vw,2.8rem); font-weight:700;
    letter-spacing:-0.03em; line-height:1.08; }
  .sub { margin:10px 0 0; color:var(--muted); font-size:16px;
    letter-spacing:0.02em; }

  .toolbar { display:flex; align-items:center; gap:12px; flex-wrap:wrap;
    margin:28px 0 0; }
  .voice { display:inline-flex; align-items:center; flex:none; height:30px;
    margin-left:auto; padding:2px; border-radius:999px;
    background:var(--surface); }
  .voice button { appearance:none; display:inline-flex; align-items:center;
    justify-content:center; height:26px; padding:0 10px; border:0;
    border-radius:999px; background:transparent; color:var(--muted);
    font:inherit; font-size:12px; font-weight:500; letter-spacing:0.02em;
    cursor:pointer; transition:background-color .18s ease, color .18s ease; }
  .voice button:hover { color:var(--fg); }
  .voice button[aria-pressed="true"] { background:var(--bg); color:var(--fg);
    box-shadow:0 1px 3px rgba(0,0,0,.08); }
  .voice button:focus-visible { outline:2px solid var(--blue); outline-offset:1px; }

  .tabs { display:flex; flex-wrap:wrap; gap:8px; }
  .tabs a { display:inline-flex; align-items:center; justify-content:center;
    padding:9px 14px; border:1px solid var(--rule); border-radius:999px;
    background:var(--bg); color:var(--fg); text-decoration:none;
    font-size:14px; font-weight:500; line-height:1.2;
    transition:background-color .15s ease, border-color .15s ease,
      color .15s ease; }
  .tabs a:hover { background:var(--surface); }
  .tabs a[aria-current="true"] { background:var(--blue); border-color:var(--blue);
    color:var(--on-blue); }
  .tabs a:focus-visible { outline:2px solid var(--blue); outline-offset:2px; }

  .group { margin-top:46px; scroll-margin-top:24px; }
  .group-head { display:flex; align-items:baseline; gap:12px; margin:0 0 16px;
    padding-bottom:12px; border-bottom:1px solid var(--rule); }
  .group-head h2 { margin:0; font-size:1.35rem; font-weight:700;
    letter-spacing:-0.02em; }
  .group-meta { color:var(--muted); font-size:13px; letter-spacing:0.03em; }
  .group-note { margin:-4px 0 18px; color:var(--muted); font-size:14px;
    line-height:1.5; }
  .pairs { display:flex; flex-direction:column; gap:30px; }
  .pair-head { display:flex; align-items:center; flex-wrap:wrap; gap:10px;
    margin:0 0 12px; }
  .pair-title { color:var(--muted); font-size:13px; font-weight:600;
    letter-spacing:0.03em; }
  .pair-path { display:inline-flex; align-items:center; gap:8px;
    font-family:var(--font-ipa); font-size:19px; font-weight:600;
    letter-spacing:-0.01em; }
  .pair-path .tag { font-family:var(--font); font-size:11px; font-weight:500;
    letter-spacing:0.02em; padding:2px 7px; border-radius:999px;
    font-style:normal; }
  .pair-path .tag.voiceless { background:var(--blue-tint); color:var(--blue); }
  .pair-path .tag.voiced { background:var(--surface-strong); color:var(--fg); }
  .pair-path .arrow { color:var(--muted); font-family:var(--font);
    font-size:14px; font-weight:400; }
  .pair-note { margin:-2px 0 12px; color:var(--muted); font-size:14px;
    line-height:1.5; }
  .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr));
    gap:18px; }
  .card { padding:20px 22px 14px; border:1px solid var(--rule);
    border-radius:24px; background:var(--bg); }
  .card-head { display:flex; align-items:center; flex-wrap:wrap; gap:10px;
    padding-bottom:13px; border-bottom:1px solid var(--rule); }
  .ipa { font-family:var(--font-ipa); font-size:2rem; font-weight:600;
    line-height:1.1; letter-spacing:-0.02em; }
  .badge { flex:none; padding:4px 10px; border-radius:999px;
    background:var(--surface); color:var(--muted); font-size:12px;
    font-weight:500; letter-spacing:0.02em; white-space:nowrap; }
  .badge.voiceless { background:var(--blue-tint); color:var(--blue); }
  .badge.voiced { background:var(--surface-strong); color:var(--fg); }
  .hint { margin:12px 0 0; padding:10px 12px; border-radius:12px;
    background:var(--surface); color:var(--muted); font-size:14px;
    line-height:1.5; }
  .words { display:grid; grid-template-columns:1fr 1fr; gap:0 18px;
    margin-top:9px; }
  .word { appearance:none; border:0; background:transparent; color:inherit;
    font:inherit; font-size:19px; line-height:1.2; text-align:center;
    padding:8px 8px; border-radius:10px; cursor:pointer;
    transition:background-color .12s ease, color .12s ease; }
  .word u { text-decoration-color:var(--blue); text-decoration-thickness:2px;
    text-underline-offset:3px; }
  .word:hover { background:var(--surface); }
  .word.playing { background:var(--blue-tint); color:var(--blue); }
  .word:focus-visible { outline:2px solid var(--blue); outline-offset:1px; }

  @media (max-width:1239px) {
    .toolbar { position:sticky; top:env(safe-area-inset-top,0px);
      z-index:40; flex-wrap:wrap; margin:24px -4px 0; padding:10px 4px;
      background:var(--bg); border-bottom:1px solid var(--rule); }
    .tabs { flex:1 1 100%; width:100%; min-width:0; max-width:100%;
      flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none;
      padding-bottom:1px; }
    .tabs::-webkit-scrollbar { display:none; }
    .tabs a { flex:none; }
    .group { scroll-margin-top:calc(76px + env(safe-area-inset-top,0px)); }
  }
  @media (min-width:1240px) {
    .toolbar { position:fixed; top:50%; right:max(16px,env(safe-area-inset-right,0px));
      transform:translateY(-50%); z-index:40; flex-direction:column;
      align-items:stretch; flex-wrap:nowrap; width:132px; margin:0;
      padding:12px; border:1px solid var(--rule); border-radius:22px;
      background:var(--bg); box-shadow:0 10px 32px rgba(0,0,0,.10); }
    .tabs { flex-direction:column; gap:6px; }
    .tabs a { justify-content:center; padding:9px 12px;
      white-space:nowrap; }
  }
  @media (max-width:760px) {
    .grid { grid-template-columns:1fr; }
    .toolbar { padding:8px 4px; }
    .tabs { display:flex; flex-wrap:wrap; gap:6px; overflow:visible; }
    .tabs a { flex:1 1 auto; width:auto; min-width:0; padding:7px 10px; }
    .group { scroll-margin-top:calc(64px + env(safe-area-inset-top,0px)); }
  }
  @media (max-width:340px) {
    .group { scroll-margin-top:calc(96px + env(safe-area-inset-top,0px)); }
  }
  @media (max-width:420px) {
    .card { padding:18px 16px 12px; }
    .ipa { font-size:1.75rem; }
    .word { font-size:18px; padding:8px 6px; }
  }
</style>
<!-- npesl-theme-inline -->
<style>
<!--THEME_CSS-->
</style>
</head>
<body>
<div class="page">
  <a class="npesl-back" id="ipa-back" href="../index.html" aria-label="返回 NPESL">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7"/></svg>NPESL
  </a>

  <header class="hero">
    <h1>美式英语音标表</h1>
    <p class="sub">American English Pronunciation</p>
  </header>

  <div class="toolbar">
    <nav class="tabs" id="sectionNav" aria-label="音标分类">
<!--NAV-->
    </nav>
  </div>

  <main>
<!--SECTIONS-->
  </main>
</div>
<script>
(function () {
  var player = new Audio();
  player.preload = 'none';
  var active = null, token = 0;
  var VOICES_KEY = 'npesl-ipa-voices';
  var saved = {};
  try {
    var stored = JSON.parse(localStorage.getItem(VOICES_KEY) || '{}');
    saved = stored && typeof stored === 'object' ? stored : {};
  } catch (e) {
    saved = {};
  }

  function clearActive() {
    if (active) {
      active.classList.remove('playing');
      active = null;
    }
  }

  function stop() {
    token += 1;
    player.pause();
    clearActive();
  }

  function cardVoice(card) {
    var pressed = card.querySelector('.voice button[aria-pressed="true"]');
    return pressed ? pressed.dataset.voice : 'f';
  }

  function play(button) {
    var card = button.closest('.card');
    if (!card) return;
    var voice = cardVoice(card);
    var source = button.getAttribute(voice === 'm'
      ? 'data-audio-m' : 'data-audio-f');
    if (!source) return;
    stop();
    var current = ++token;
    active = button;
    button.classList.add('playing');
    player.src = source;
    var result = player.play();
    if (result && result.catch) {
      result.catch(function () { if (current === token) clearActive(); });
    }
  }

  Array.prototype.forEach.call(document.querySelectorAll('.card'), function (card) {
    var sound = card.getAttribute('data-sound');
    var buttons = Array.prototype.slice.call(
      card.querySelectorAll('.voice button[data-voice]')
    );
    var voice = saved[sound] === 'm' ? 'm' : 'f';
    buttons.forEach(function (button) {
      button.setAttribute('aria-pressed',
        String(button.dataset.voice === voice));
      button.addEventListener('click', function () {
        if (button.dataset.voice === voice) return;
        voice = button.dataset.voice;
        buttons.forEach(function (item) {
          item.setAttribute('aria-pressed', String(item === button));
        });
        saved[sound] = voice;
        try {
          localStorage.setItem(VOICES_KEY, JSON.stringify(saved));
        } catch (e) {}
        stop();
      });
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('.word'),
    function (button) {
      button.addEventListener('click', function () { play(button); });
    });

  player.addEventListener('ended', clearActive);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
  });

  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll('#sectionNav a')
  );
  var groups = Array.prototype.slice.call(
    document.querySelectorAll('main > .group')
  );

  function setCurrent(sectionId) {
    navLinks.forEach(function (link) {
      var current = link.dataset.target === sectionId;
      link.setAttribute('aria-current', String(current));
      var nav = link.parentElement;
      if (current && nav.scrollWidth > nav.clientWidth) {
        nav.scrollTo({
          left: link.offsetLeft - (nav.clientWidth - link.offsetWidth) / 2,
          behavior: 'smooth'
        });
      }
    });
  }

  navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      setCurrent(link.dataset.target);
    });
  });

  if ('IntersectionObserver' in window && groups.length) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setCurrent(entry.target.id);
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    groups.forEach(function (group) { observer.observe(group); });
  }

  var back = document.getElementById('ipa-back');
  if (back) {
    var path = location.pathname;
    try { path = decodeURIComponent(path); } catch (err) {}
    // 部署在 /ipa/、离线包、暂存站都用 ../index.html；
    // 只有在本库目录里直接预览时，才回到 06-发音/网站/。
    if (path.indexOf('/ipa/') === -1 && path.indexOf('音标表') !== -1) {
      back.href = '../网站/index.html';
    }
  }
})();
</script>
<script>
<!--THEME_JS-->
</script>
</body>
</html>
"""


if __name__ == "__main__":
    raise SystemExit(main())
