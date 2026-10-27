#!/usr/bin/env python3
"""Assemble a self-contained offline copy of the NPESL site.

Unlike build_cloudflare_site.py (which deploys to a domain and may use
root-absolute paths), this build must work when opened straight from disk with
file://:

    NPESL-offline/
        index.html              入口页（各应用都从这里进）
        theme.css / theme.js
        npesl-icon.png ...
        phonics/index.html      自然拼读 48 课
        phonics/lessons/*.html
        ipa/index.html          美式英语音标表
        ipa/audio/*.mp3
        drill/index.html        Question Drill
        drill/audio/{f,m}/*.mp3

All references are rewritten to relative paths, directory links point at
index.html explicitly (browsers show a listing for bare file:// directories),
and the result is zipped next to the folder.

Run from anywhere:  .venv/bin/python -I build/build_offline_package.py
"""

from __future__ import annotations

import datetime as dt
import re
import shutil
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paths import (CONVERSATION_OUT, DRILL_APP, IPA_APP, OFFLINE_OUT,
                   PHONICS_APP, SITE_APP)

ROOT = Path(__file__).resolve().parent.parent
SITE_SRC = SITE_APP
PHONICS = PHONICS_APP
IPA = IPA_APP
DRILL = DRILL_APP
CONVERSATION = CONVERSATION_OUT
OUT = OFFLINE_OUT
PACKAGE_NAME = "NPESL-offline"

THEME_HEAD = (
    "<script>try{var t=localStorage.getItem('npesl-theme');"
    "document.documentElement.setAttribute('data-theme',"
    "t&&['auto','bright','dark','sepia'].indexOf(t)>-1?t:'auto');}"
    "catch(e){document.documentElement.setAttribute('data-theme','auto');}</script>\n"
    '<link rel="stylesheet" href="__PREFIX__theme.css">'
)
THEME_TAIL = '<script src="__PREFIX__theme.js" defer></script>'


def write_page(path: Path, text: str) -> None:
    """Write text without newline translation (Path.write_text gained newline= in 3.10)."""
    with path.open("w", encoding="utf-8", newline="") as fh:
        fh.write(text)


def inject_theme(path: Path, prefix: str) -> None:
    """Add the theme bootstrap + stylesheet, using a relative prefix."""
    text = path.read_text(encoding="utf-8")
    if "theme.css" in text or "npesl-theme-inline" in text:
        return
    head = THEME_HEAD.replace("__PREFIX__", prefix)
    tail = THEME_TAIL.replace("__PREFIX__", prefix)
    match = re.search(r"</title>", text)
    if match:
        text = text[: match.end()] + "\n" + head + text[match.end():]
    elif "</head>" in text:
        text = text.replace("</head>", head + "\n</head>", 1)
    else:
        text = head + "\n" + text
    if "</body>" in text:
        text = text.replace("</body>", tail + "\n</body>", 1)
    else:
        text = text + "\n" + tail
    write_page(path, text)


def inject_back(path: Path, href: str, label: str) -> None:
    """Insert the back link at the top of the page container."""
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


def rewrite(path: Path, pairs: list[tuple[str, str]]) -> None:
    text = path.read_text(encoding="utf-8")
    for old, new in pairs:
        text = text.replace(old, new)
    write_page(path, text)


def main() -> int:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    # 入口页与图标
    for name in ("index.html", "theme.css", "theme.js", "npesl-icon.png",
                 "apple-touch-icon.png", "favicon-32.png", "favicon-16.png",
                 "favicon.ico"):
        shutil.copy2(SITE_SRC / name, OUT / name)
    # 裸目录链接在 file:// 下会变成文件列表，必须指向 index.html
    rewrite(OUT / "index.html", [
        ('href="phonics/"', 'href="phonics/index.html"'),
        ('href="ipa/"', 'href="ipa/index.html"'),
        ('href="drill/"', 'href="drill/index.html"'),
    ])

    # 自然拼读：目录页 + 48 课
    phonics_out = OUT / "phonics"
    phonics_out.mkdir()
    shutil.copy2(PHONICS / "index.html", phonics_out / "index.html")
    shutil.copytree(PHONICS / "lessons", phonics_out / "lessons")
    inject_theme(phonics_out / "index.html", "../")
    inject_back(phonics_out / "index.html", "../index.html", "NPESL")
    for page in sorted((phonics_out / "lessons").glob("*.html")):
        inject_theme(page, "../../")
        inject_back(page, "../index.html", "自然拼读")

    # 美式英语音标表：单页 + 单词音频
    ipa_out = OUT / "ipa"
    shutil.copytree(IPA, ipa_out)
    inject_theme(ipa_out / "index.html", "../")
    inject_back(ipa_out / "index.html", "../index.html", "NPESL")

    # Question Drill：目录页 + 男女音频
    drill_out = OUT / "drill"
    drill_out.mkdir()
    shutil.copy2(DRILL / "index.html", drill_out / "index.html")
    shutil.copytree(DRILL / "audio", drill_out / "audio")
    rewrite(drill_out / "index.html", [
        ('href="/npesl-icon.png"', 'href="../npesl-icon.png"'),
        ('href="/apple-touch-icon.png"', 'href="../apple-touch-icon.png"'),
    ])
    inject_theme(drill_out / "index.html", "../")
    inject_back(drill_out / "index.html", "../index.html", "NPESL")

    # Conversation Starters：页面自带相对主题链接，整棵搬过来；音频站地址改回相对路径
    if CONVERSATION.exists():
        shutil.copytree(CONVERSATION, OUT / "conversation")
        for page in sorted((OUT / "conversation").glob("*/*.html")):
            rewrite(page, [
                ("https://npesl-audio.pages.dev/audio/", "../audio/"),
            ])
    else:
        print(f"警告：{CONVERSATION.relative_to(ROOT)} 不存在，"
              "Conversation Starters 未包含；先运行 build_site.py")

    files = [p for p in OUT.rglob("*") if p.is_file()]
    size = sum(p.stat().st_size for p in files)

    stamp = dt.date.today().isoformat()
    zip_path = ROOT / "build" / f"{PACKAGE_NAME}-{stamp}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for path in sorted(files):
            zf.write(path, f"{PACKAGE_NAME}/{path.relative_to(OUT).as_posix()}")

    print(f"离线目录：{OUT.relative_to(ROOT)}")
    print(f"文件 {len(files)} 个，共 {size / 1024 / 1024:.1f} MB")
    print(f"压缩包：{zip_path.relative_to(ROOT)}"
          f"（{zip_path.stat().st_size / 1024 / 1024:.1f} MB）")
    print(f"入口：{PACKAGE_NAME}/index.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
