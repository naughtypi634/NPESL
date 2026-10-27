#!/usr/bin/env python3
"""Assemble the NPESL public site from the source pages.

Cloudflare Pages caps a deployment at 20,000 files, and two voices of
Conversation Starters audio push the site past that.  The build therefore
splits into two deploy roots:

    build/cloudflare-site/          主站 → 项目 npesl
        index.html                  NPESL 入口页（apps/site/index.html）
        npesl-icon.png              分享卡片 / favicon
        phonics/                    自然拼读 48 课（index + lessons）
        ipa/                        美式英语音标表（index + audio）
        drill/                      Question Drill（index + audio/f,m）
        conversation/               Conversation Starters 页面
        conversation/eslse/audio/   ESLSE 语音（放主站，音频站装不下第七级）

    build/cloudflare-audio/         音频站 → 项目 npesl-audio
        audio/ava/…                  A1–C2 女声
        audio/andrew/…               A1–C2 男声
        _headers                    长缓存

页面里的音频地址由 build/conversation_starters/build_site.py 写入：
A1–C2 用 https://npesl-audio.pages.dev/audio/，ESLSE 用相对的 audio/。

The directories are gitignored: they are deploy staging areas, not sources.
Run from anywhere:  python -I build/build_cloudflare_site.py
"""

from __future__ import annotations

import html
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paths import (AUDIO_OUT, CONVERSATION_OUT, DRILL_APP, ESLSE_MIRROR,
                   IPA_APP, PHENOMENA_APP, PHONICS_APP, SITE_APP, SITE_OUT)

ROOT = Path(__file__).resolve().parent.parent
SITE_SRC = SITE_APP
PHONICS = PHONICS_APP
IPA = IPA_APP
PHENOMENA = PHENOMENA_APP
DRILL = DRILL_APP
CONVERSATION = CONVERSATION_OUT
ESLSE = ESLSE_MIRROR
OUT = SITE_OUT

SITE_URL = "https://npesl.pages.dev"
AUDIO_URL = "https://npesl-audio.pages.dev"
ICON = f"{SITE_URL}/npesl-icon.png"

HEADERS = """/phonics/audio/*
  Cache-Control: public, max-age=31536000, immutable

/drill/bank.*.js
  Cache-Control: public, max-age=31536000, immutable

/drill/audio/*
  Cache-Control: public, max-age=31536000, immutable

/ipa/audio/*
  Cache-Control: public, max-age=31536000, immutable

/phenomena/audio/*
  Cache-Control: public, max-age=31536000, immutable

/conversation/eslse/audio/*
  Cache-Control: public, max-age=31536000, immutable

/npesl-icon.png
  Cache-Control: public, max-age=604800
"""

AUDIO_HEADERS = """/*
  Cache-Control: public, max-age=31536000, immutable
"""

# 旧页面缓存里还是主站下的 /conversation/audio/Ava/…，转给新的音频站。
REDIRECTS = """/conversation/audio/Ava/*  https://npesl-audio.pages.dev/audio/ava/:splat  301
/conversation/audio/ava/*  https://npesl-audio.pages.dev/audio/ava/:splat  301
"""

THEME_HEAD = (
    "<script>try{var t=localStorage.getItem('npesl-theme');"
    "document.documentElement.setAttribute('data-theme',"
    "t&&['auto','bright','dark','sepia'].indexOf(t)>-1?t:'auto');}"
    "catch(e){document.documentElement.setAttribute('data-theme','auto');}</script>\n"
    '<link rel="stylesheet" href="/theme.css">'
)
THEME_TAIL = '<script src="/theme.js" defer></script>'


def write_page(path: Path, text: str) -> None:
    """Write without newline translation (Path.write_text gained newline= in 3.10)."""
    with path.open("w", encoding="utf-8", newline="") as fh:
        fh.write(text)


def inject_back(path: Path, href: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if "npesl-back" in text:
        return
    arrow = (
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
        'aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'
    )
    link = f'<a class="npesl-back" href="{href}">{arrow}{label}</a>'
    for marker in ('<div class="page">', '<main class="page">'):
        if marker in text:
            text = text.replace(marker, marker + link, 1)
            write_page(path, text)
            return


def inject_theme(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if "theme.css" in text or "npesl-theme-inline" in text:
        return
    match = re.search(r"</title>", text)
    if match:
        text = text[: match.end()] + "\n" + THEME_HEAD + text[match.end():]
    elif "</head>" in text:
        text = text.replace("</head>", THEME_HEAD + "\n</head>", 1)
    else:
        text = THEME_HEAD + "\n" + text
    if "</body>" in text:
        text = text.replace("</body>", THEME_TAIL + "\n</body>", 1)
    else:
        text = text + "\n" + THEME_TAIL
    write_page(path, text)


def replace_back(path: Path, href: str, label: str) -> None:
    """Swap a product's own back link for the shared NPESL one."""
    text = path.read_text(encoding="utf-8")
    text = re.sub(r'\s*<a class="back" href="[^"]*">[^<]*</a>\n?', "\n", text, count=1)
    write_page(path, text)
    inject_back(path, href, label)


def inject_head(path: Path, url: str, description: str) -> None:
    text = path.read_text(encoding="utf-8")
    if "og:image" in text:
        return
    if "charset" not in text[:600].lower():
        text = '<meta charset="utf-8">\n' + text
    match = re.search(r"<title>(.*?)</title>", text, re.S)
    title = html.unescape(match.group(1)) if match else "NPESL"
    block = f"""
<link rel="icon" type="image/png" sizes="512x512" href="/npesl-icon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:site_name" content="NPESL">
<meta property="og:title" content="{html.escape(title, quote=True)}">
<meta property="og:image" content="{ICON}">
<meta property="og:image:width" content="512">
<meta property="og:image:height" content="512">
<meta property="og:url" content="{SITE_URL}/{url}">
<meta property="og:type" content="website">"""
    if match:
        text = text[: match.end()] + block + text[match.end():]
    elif "<head>" in text:
        text = text.replace("<head>", "<head>" + block, 1)
    else:
        text = block + text
    write_page(path, text)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if OUT.exists():
        shutil.rmtree(OUT)
    if AUDIO_OUT.exists():
        shutil.rmtree(AUDIO_OUT)
    OUT.mkdir(parents=True)

    # 入口页与图标
    for name in ("index.html", "theme.css", "theme.js", "npesl-icon.png",
                 "apple-touch-icon.png", "favicon-32.png", "favicon-16.png",
                 "favicon.ico"):
        shutil.copy2(SITE_SRC / name, OUT / name)

    # 自然拼读：目录页 + 48 课
    phonics_out = OUT / "phonics"
    (phonics_out).mkdir()
    shutil.copy2(PHONICS / "index.html", phonics_out / "index.html")
    shutil.copytree(PHONICS / "lessons", phonics_out / "lessons")
    shutil.copytree(PHONICS / "audio", phonics_out / "audio")
    inject_head(
        phonics_out / "index.html",
        "phonics/",
        "自然拼读阅读训练 · 48 课 · 成人 A1",
    )
    inject_theme(phonics_out / "index.html")
    inject_back(phonics_out / "index.html", "/", "NPESL")
    for page in sorted((phonics_out / "lessons").glob("*.html")):
        inject_head(
            page,
            f"phonics/lessons/{page.name}",
            "自然拼读阅读训练 · 成人 A1",
        )
        inject_theme(page)
        inject_back(page, "/phonics/", "自然拼读")

    # 美式英语音标表：单页 + 单词音频
    ipa_out = OUT / "ipa"
    shutil.copytree(IPA, ipa_out)
    inject_head(
        ipa_out / "index.html",
        "ipa/",
        "美式英语音标表 · 40 个音标 × 10 个单词",
    )
    inject_theme(ipa_out / "index.html")
    inject_back(ipa_out / "index.html", "/", "NPESL")

    # 常见发音现象：30 章 + 音频，自带样式，不注入 theme
    if PHENOMENA.exists():
        phenomena_out = OUT / "phenomena"
        shutil.copytree(
            PHENOMENA,
            phenomena_out,
            ignore=shutil.ignore_patterns("source", "__pycache__", "*.py", "*.md"),
        )
        index_page = phenomena_out / "index.html"
        inject_head(index_page, "phenomena/", "常见发音现象(AmE) · 30 章")
        inject_theme(index_page)
        replace_back(index_page, "/", "NPESL")
        for page in sorted(phenomena_out.glob("*.html")):
            if page.name == "index.html":
                continue
            inject_head(page, f"phenomena/{page.name}", "常见发音现象(AmE)")
            inject_theme(page)
            replace_back(page, "/phenomena/", "常见发音现象")
        print("  常见发音现象：已包含")
    else:
        print("警告：常见发音现象 目录不存在，未包含")

    # Question Drill：目录页 + 男女音频
    drill_out = OUT / "drill"
    drill_out.mkdir()
    shutil.copy2(DRILL / "index.html", drill_out / "index.html")
    for bank in DRILL.glob("bank.*.js"):
        shutil.copy2(bank, drill_out / bank.name)
    shutil.copytree(DRILL / "audio", drill_out / "audio")
    inject_head(
        drill_out / "index.html",
        "drill/",
        "中译英随机练习 · 1,370 题",
    )
    inject_theme(drill_out / "index.html")
    inject_back(drill_out / "index.html", "/", "NPESL")

    # Conversation Starters：页面和 ESLSE 语音进主站，A1–C2 两套语音进音频站
    def skip_top_audio(directory, names):
        return {"audio"} if Path(directory) == CONVERSATION else set()

    if CONVERSATION.exists():
        shutil.copytree(CONVERSATION, OUT / "conversation",
                        ignore=skip_top_audio)
        audio_src = CONVERSATION / "audio"
        if audio_src.exists():
            shutil.copytree(audio_src, AUDIO_OUT / "audio")
            (AUDIO_OUT / "_headers").write_text(AUDIO_HEADERS, encoding="utf-8")
        else:
            print("警告：conversation/audio 不存在，"
                  "音频站未生成；先运行 build_site.py")
    else:
        print(f"警告：{CONVERSATION.relative_to(ROOT)} 不存在，"
              "Conversation Starters 未包含；先运行 build_site.py")

    # ESLSE 第七级与其余级别同源生成，页面样式由 build_site.py 统一；
    # 语音单独留在主站（音频站装不下第七级）。生成时若未带音频，
    # 从旧的镜像目录补一份，文件名同为内容哈希，可直接复用。
    eslse_dest = OUT / "conversation" / "eslse"
    if eslse_dest.exists():
        if not (eslse_dest / "audio").exists() and (ESLSE / "audio").exists():
            shutil.copytree(ESLSE / "audio", eslse_dest / "audio")
        print("  Conversation Starters ESLSE：已包含")
    else:
        print("警告：conversation/eslse 不存在，"
              "ESLSE 未包含；先运行 build_site.py")

    (OUT / "_headers").write_text(HEADERS, encoding="utf-8")
    (OUT / "_redirects").write_text(REDIRECTS, encoding="utf-8")

    def stats(path: Path) -> tuple:
        files = [p for p in path.rglob("*") if p.is_file()]
        return len(files), sum(p.stat().st_size for p in files) / 1024 / 1024

    files, size = stats(OUT)
    print(f"主站：{OUT.relative_to(ROOT)}")
    print(f"  文件 {files} 个，共 {size:.1f} MB")
    print(f"  入口：{SITE_URL}/")
    print(f"  自然拼读：{SITE_URL}/phonics/")
    print(f"  美式英语音标表：{SITE_URL}/ipa/")
    print(f"  Question Drill：{SITE_URL}/drill/")
    print(f"  常见发音现象：{SITE_URL}/phenomena/")
    if AUDIO_OUT.exists():
        afiles, asize = stats(AUDIO_OUT)
        print(f"音频站：{AUDIO_OUT.relative_to(ROOT)}")
        print(f"  文件 {afiles} 个，共 {asize:.1f} MB")
        print(f"  地址：{AUDIO_URL}/audio/")
    print(f"合计 {files + (stats(AUDIO_OUT)[0] if AUDIO_OUT.exists() else 0)} 个文件")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
