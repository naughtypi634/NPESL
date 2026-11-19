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
        phenomena/                  常见发音现象 30 章
        collocation/                短语搭配 41 个主题
        conversation/               Conversation Starters 页面（Beginner / Intermediate / ESLSE）
        charts/                     数据图表英语（/charts/ 直达，首页不列入入口）

    build/cloudflare-audio/         音频站 → 项目 npesl-audio
        audio/ava/sprites/…         全部级别女声（每页一条 sprite）
        audio/andrew/sprites/…      全部级别男声
        _headers                    长缓存

页面里的音频地址由 apps/conversation/source/build_site.py 写入：
所有级别（含 ESLSE）都用 https://npesl-audio.pages.dev/audio/。

The directories are gitignored: they are deploy staging areas, not sources.
Run from anywhere:  python -I tools/build_cloudflare_site.py
"""

from __future__ import annotations

import html
import re
import shutil
import sys
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from paths import (AUDIO_OUT, AUDIO_URL, CONVERSATION_APP, DRILL_APP,
                   IPA_APP, PHENOMENA_APP, PHONICS_APP, COLLOCATION_APP,
                   DATA_VIZ_APP, SITE_APP, SITE_OUT, SITE_URL, VISUAL_VOCAB_APP)
from themes import theme_boot

ROOT = Path(__file__).resolve().parent.parent
SITE_SRC = SITE_APP
PHONICS = PHONICS_APP
IPA = IPA_APP
PHENOMENA = PHENOMENA_APP
COLLOCATION = COLLOCATION_APP
DRILL = DRILL_APP
CONVERSATION = CONVERSATION_APP
VISUAL_VOCAB = VISUAL_VOCAB_APP
DATA_VIZ = DATA_VIZ_APP
OUT = SITE_OUT

ICON = f"{SITE_URL}/npesl-icon.png"

HEADERS = """/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/phonics/audio/*
  Cache-Control: public, max-age=31536000, immutable

/drill/bank.*.js
  Cache-Control: public, max-age=31536000, immutable

/collocation/data.*.js
  Cache-Control: public, max-age=31536000, immutable

/charts/assets/*
  Cache-Control: public, max-age=31536000, immutable

/charts/data/*.json
  Cache-Control: public, max-age=0, must-revalidate

/charts/data/charts/*.json
  Cache-Control: public, max-age=0, must-revalidate

/charts/data/expressions/*.json
  Cache-Control: public, max-age=0, must-revalidate

/charts/data/contexts/*.json
  Cache-Control: public, max-age=0, must-revalidate

/charts/data/previews/*.svg
  Cache-Control: public, max-age=0, must-revalidate

/visual-vocabulary/*.webp
  Cache-Control: public, max-age=604800

/drill/audio/*
  Cache-Control: public, max-age=31536000, immutable

/ipa/audio/*
  Cache-Control: public, max-age=31536000, immutable

/phenomena/audio/*
  Cache-Control: public, max-age=31536000, immutable

/collocation/audio/*
  Cache-Control: public, max-age=31536000, immutable

/conversation/eslse/audio/*
  Cache-Control: public, max-age=31536000, immutable

/visual-vocabulary/*.mp3
  Cache-Control: public, max-age=31536000, immutable

/npesl-icon.png
  Cache-Control: public, max-age=604800
"""

AUDIO_HEADERS = """/*
  Cache-Control: public, max-age=31536000, immutable
"""

# 旧页面缓存里还是主站下的 /conversation/audio/Ava/… 或 ESLSE 的相对
# audio/…，转给音频站。旧的 /phrasal/ 路径转给 /collocation/。
REDIRECTS = """/charts  /charts/  301
/data-viz/*  /charts/:splat  301
/data-viz  /charts/  301
/phrasal/*  /collocation/:splat  301
/phrasal  /collocation/  301
/conversation/audio/Ava/*  https://npesl-audio.pages.dev/audio/ava/:splat  301
/conversation/audio/ava/*  https://npesl-audio.pages.dev/audio/ava/:splat  301
/conversation/eslse/audio/*  https://npesl-audio.pages.dev/audio/:splat  301
/visual-vocabulary/fit/*  /visual-vocabulary/clothing/  301
/visual-vocabulary/fit  /visual-vocabulary/clothing/  301
"""

THEME_HEAD = theme_boot("/theme.css")
THEME_TAIL = '<script src="/theme.js" defer></script>'


@dataclass(frozen=True)
class BackLink:
    href: str
    label: str
    replace: bool = False


@dataclass(frozen=True)
class PageGroup:
    """One set of copied pages that get the same head, theme and back link."""

    base: Path
    pattern: str
    url: Callable[[str], str]
    back: BackLink
    skip: frozenset[str] = frozenset()


def write_page(path: Path, text: str) -> None:
    """Write without newline translation (Path.write_text gained newline= in 3.10)."""
    with path.open("w", encoding="utf-8", newline="") as fh:
        fh.write(text)


def inject_back(path: Path, href: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if 'class="npesl-back"' in text:
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
    text = re.sub(r'\s*<a class="back" href="[^"]*">.*?</a>\n?', "\n",
                  text, count=1, flags=re.S)
    write_page(path, text)
    inject_back(path, href, label)


def inject_head(path: Path, url: str) -> None:
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



def finish_group(group: PageGroup) -> None:
    """Apply head → theme → back, in that order, to every page in a group.

    The order is load-bearing: inject_head and inject_theme both anchor on
    </title>, so swapping them changes the bytes of every page.  Every group
    gets the Solid Glass theme boot / theme.css / theme.js.
    """
    for page in sorted(group.base.glob(group.pattern)):
        if page.name in group.skip:
            continue
        inject_head(page, group.url(page.name))
        inject_theme(page)
        if group.back.replace:
            replace_back(page, group.back.href, group.back.label)
        else:
            inject_back(page, group.back.href, group.back.label)


def drill_ignore(directory, names):
    """网页只要拼好的 sprite；逐条录音留在 apps/drill/audio/ 作母版。"""
    if Path(directory) == DRILL / "audio":
        return {"f", "m"}
    return set()


def phenomena_ignore(directory, names):
    """只要拼好的 sprite；逐条录音（audio/f、audio/m）不进部署包。"""
    skip = set(shutil.ignore_patterns("source", "__pycache__", "*.py", "*.md", "*.pdf")(
        directory, names))
    if Path(directory) == PHENOMENA / "audio":
        skip |= {"f", "m"}
    return skip


def collocation_ignore(directory, names):
    """只要拼好的 sprite；逐条录音（audio/f、audio/m）不进部署包。"""
    skip = set(shutil.ignore_patterns("source", "__pycache__", "*.py", "*.md", "*.pdf")(
        directory, names))
    if Path(directory) == COLLOCATION / "audio":
        skip |= {"f", "m"}
    return skip


def ipa_ignore(directory, names):
    """部署只要拼好的 sprite，不搬逐词母版。"""
    if Path(directory).name == "audio":
        return {n for n in names if n.endswith(".mp3")}
    return set()

def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    import argparse
    parser = argparse.ArgumentParser(description="装配 Cloudflare Pages 部署树")
    parser.add_argument("--no-image-opt", action="store_true",
                        help="Visual Vocabulary 保持 640px 原图（回滚用）")
    parser.add_argument("--with-data-viz", action="store_true",
                        help="兼容旧命令；数据图表英语现在默认装配到 /charts/（首页不列入）")
    args = parser.parse_args()

    vv_images = None
    if not args.no_image_opt:
        from build_vv_images import (ensure_derivatives, inject_lazy_attrs,
                                     overlay_derivatives)
        vv_images = (ensure_derivatives, inject_lazy_attrs, overlay_derivatives)
        built, skipped = vv_images[0]()
        print(f"  Visual Vocabulary 480px：生成 {built}，复用 {skipped}")

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

    # 自托管字体：Geist latin / latin-ext（可变字体）
    fonts_src = SITE_SRC / "fonts"
    if not (fonts_src / "geist-latin-v5.woff2").exists():
        print(f"错误：缺少 {fonts_src / 'geist-latin-v5.woff2'}；"
              "先放回自托管字体再装配", file=sys.stderr)
        return 2
    shutil.copytree(fonts_src, OUT / "fonts")

    site_back = BackLink("/", "NPESL")

    # 自然拼读：目录页 + 48 课
    phonics_out = OUT / "phonics"
    phonics_out.mkdir()
    shutil.copy2(PHONICS / "index.html", phonics_out / "index.html")
    shutil.copytree(PHONICS / "lessons", phonics_out / "lessons")
    shutil.copytree(PHONICS / "audio", phonics_out / "audio")
    finish_group(PageGroup(
        phonics_out, "index.html", lambda _: "phonics/", site_back))
    finish_group(PageGroup(
        phonics_out / "lessons", "*.html",
        lambda name: f"phonics/lessons/{name}",
        BackLink("/phonics/", "自然拼读")))

    # 美式英语音标表：单页 + 单词音频
    ipa_out = OUT / "ipa"
    shutil.copytree(IPA, ipa_out, ignore=ipa_ignore)
    finish_group(PageGroup(
        ipa_out, "index.html", lambda _: "ipa/", site_back))

    # 常见发音现象：30 章 + 音频
    if PHENOMENA.exists():
        phenomena_out = OUT / "phenomena"
        shutil.copytree(PHENOMENA, phenomena_out, ignore=phenomena_ignore)
        finish_group(PageGroup(
            phenomena_out, "index.html", lambda _: "phenomena/", site_back))
        finish_group(PageGroup(
            phenomena_out, "*.html", lambda name: f"phenomena/{name}",
            BackLink("/phenomena/", "常见发音现象", replace=True),
            frozenset({"index.html"})))
        print("  常见发音现象：已包含")
    else:
        print("警告：常见发音现象 目录不存在，未包含")

    # 短语搭配：主题页 + 每页一条 sprite
    if COLLOCATION.exists():
        collocation_out = OUT / "collocation"
        shutil.copytree(COLLOCATION, collocation_out, ignore=collocation_ignore)
        finish_group(PageGroup(
            collocation_out, "index.html", lambda _: "collocation/", site_back))
        finish_group(PageGroup(
            collocation_out, "*.html", lambda name: f"collocation/{name}",
            BackLink("/collocation/", "短语搭配", replace=True),
            frozenset({"index.html"})))
        print("  短语搭配：已包含")
    else:
        print("警告：短语搭配目录不存在，未包含")

    # Question Drill：目录页 + 男女音频
    drill_out = OUT / "drill"
    drill_out.mkdir()
    shutil.copy2(DRILL / "index.html", drill_out / "index.html")
    for bank in DRILL.glob("bank.*.js"):
        shutil.copy2(bank, drill_out / bank.name)
    shutil.copytree(DRILL / "audio", drill_out / "audio", ignore=drill_ignore)
    finish_group(PageGroup(
        drill_out, "index.html", lambda _: "drill/", site_back))

    # 数据图表英语：部署在 /charts/，首页不列入入口。
    charts_dist = DATA_VIZ / "dist"
    if (charts_dist / "index.html").exists():
        charts_out = OUT / "charts"
        shutil.copytree(charts_dist, charts_out)
        finish_group(PageGroup(
            charts_out, "index.html", lambda _: "charts/", site_back))
        print("  数据图表英语：已包含 /charts/（首页不列入）")
    else:
        print("警告：数据图表英语 dist 不存在，先跑 build_all.py --only data-viz")

    # Conversation Starters：页面进主站，全部级别的两套语音进音频站。
    # 应用目录里的 source/ 是构建器，不属于部署内容。
    def conversation_ignore(directory, names):
        skip = set(shutil.ignore_patterns("source", "__pycache__", "*.py", "*.md")(
            directory, names))
        if Path(directory) == CONVERSATION:
            skip |= {"audio"}
        return skip

    if CONVERSATION.exists():
        shutil.copytree(CONVERSATION, OUT / "conversation",
                        ignore=conversation_ignore)
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

    # ESLSE 第七级与其余级别同源生成，页面同样进主站。
    eslse_dest = OUT / "conversation" / "eslse"
    if eslse_dest.exists():
        print("  Conversation Starters ESLSE：已包含")
    else:
        print("警告：conversation/eslse 不存在，"
              "ESLSE 未包含；先运行 build_site.py")

    # Visual Vocabulary：Home / Clothing / Packing List / Body Parts / Cosmetics
    # 五个卡片页；旧版 Cosmetics 与黑白 My Home 仍复制上线，只是不列入口。
    if VISUAL_VOCAB.exists():
        def vv_ignore(directory, names):
            return set(shutil.ignore_patterns(
                "source", "__pycache__", "*.py", "*.md", "*.pdf")(directory, names))

        vv_out = OUT / "visual-vocabulary"
        shutil.copytree(VISUAL_VOCAB, vv_out, ignore=vv_ignore)
        if vv_images:
            _, inject_lazy, overlay = vv_images
            copied = overlay(vv_out)
            print(f"  480px 图片已替换：{copied} 个")
        finish_group(PageGroup(
            vv_out, "index.html", lambda _: "visual-vocabulary/", site_back))
        for sub in ("home", "clothing", "packing", "body-parts",
                    "cosmetics", "cosmetics-qwen21", "my-home",
                    "supermarket"):
            finish_group(PageGroup(
                vv_out / sub, "*.html",
                lambda name, sub=sub: f"visual-vocabulary/{sub}/{name}",
                BackLink("/visual-vocabulary/", "Visual Vocabulary"),
                frozenset({"index.html"})))
            finish_group(PageGroup(
                vv_out / sub, "index.html",
                lambda _, sub=sub: f"visual-vocabulary/{sub}/",
                BackLink("/visual-vocabulary/", "Visual Vocabulary")))
        if vv_images:
            lazy = vv_images[1](vv_out)
            print(f"  lazy/async 图片：{lazy} 个")
        print("  Visual Vocabulary：已包含")
    else:
        print("警告：Visual Vocabulary 目录不存在，未包含")

    # Cloudflare Pages 的 _headers 每条规则只允许一个 *；两个 * 的规则会被忽略。
    bad_rules = [
        line for line in HEADERS.splitlines()
        if line.startswith("/") and line.count("*") > 1
    ]
    if bad_rules:
        print("错误：_headers 规则含有多个 *，Cloudflare 会忽略：", file=sys.stderr)
        for line in bad_rules:
            print(f"  {line}", file=sys.stderr)
        return 2

    (OUT / "_headers").write_text(HEADERS, encoding="utf-8")
    (OUT / "_redirects").write_text(REDIRECTS, encoding="utf-8")

    # 字体已自托管：任何页面还残留 Google Fonts 都说明有生成物没重建。
    stale = [
        p for p in OUT.rglob("*.html")
        if "fonts.googleapis.com" in p.read_text(encoding="utf-8")
        or "fonts.gstatic.com" in p.read_text(encoding="utf-8")
    ]
    if stale:
        print("错误：以下页面仍引用 Google Fonts，先重建对应应用：",
              file=sys.stderr)
        for path in stale[:10]:
            print(f"  {path.relative_to(OUT)}", file=sys.stderr)
        return 2

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
    print(f"  短语搭配：{SITE_URL}/collocation/")
    if args.with_data_viz:
        print(f"  数据图表英语：{SITE_URL}/data-viz/")
    if AUDIO_OUT.exists():
        afiles, asize = stats(AUDIO_OUT)
        print(f"音频站：{AUDIO_OUT.relative_to(ROOT)}")
        print(f"  文件 {afiles} 个，共 {asize:.1f} MB")
        print(f"  地址：{AUDIO_URL}/audio/")
    print(f"合计 {files + (stats(AUDIO_OUT)[0] if AUDIO_OUT.exists() else 0)} 个文件")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
